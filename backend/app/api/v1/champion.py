from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import Integer, func, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.agent import Agent, AgentConfig
from app.models.champion import (
    ChampionCard,
    ChampionCardFeedback,
    ChampionCardStatus,
    ChampionCardVersion,
    ChampionConversation,
    ChampionMessage,
    ChampionSource,
    ChampionSourceStatus,
    GenerationChampionSource,
)
from app.models.user import UserRole
from app.schemas.champion import (
    ChampionBulkCardRequest,
    ChampionCardCreate,
    ChampionCardOut,
    ChampionCardUpdate,
    ChampionConversationOut,
    ChampionFeedbackRequest,
    ChampionMapping,
    ChampionMappingRequest,
    ChampionMessageOut,
    ChampionPreview,
    ChampionSearchRequest,
    ChampionSearchResult,
    ChampionSourceOut,
    ChampionStats,
)
from app.schemas.common import APIResponse, success_response
from app.services.champion.deduplicator import content_hash
from app.services.champion.embeddings import embed_card
from app.services.champion.mapper import map_records
from app.services.champion.parser import parse_file
from app.services.champion.redactor import redact_records
from app.services.champion.retrieval import search_champion
from app.services.champion.validator import searchable_text
from app.services.knowledge.storage import sanitize_filename
from app.tasks.champion_tasks import process_champion_task

router = APIRouter()
logger = logging.getLogger(__name__)


def require_role(current_user, *roles: UserRole) -> None:
    if current_user.role not in roles:
        raise AppException(403, "权限不足", "CHAMPION_PERMISSION_DENIED")


def find_source(db, source_id: UUID, tenant_id: UUID) -> ChampionSource:
    item = db.scalar(select(ChampionSource).where(ChampionSource.id == source_id, ChampionSource.tenant_id == tenant_id))
    if item is None:
        raise AppException(404, "销冠数据源不存在", "CHAMPION_SOURCE_NOT_FOUND")
    return item


def find_card(db, card_id: UUID, tenant_id: UUID) -> ChampionCard:
    item = db.scalar(select(ChampionCard).where(ChampionCard.id == card_id, ChampionCard.tenant_id == tenant_id))
    if item is None:
        raise AppException(404, "销冠经验卡片不存在", "CHAMPION_CARD_NOT_FOUND")
    return item


def source_out(item: ChampionSource) -> ChampionSourceOut:
    return ChampionSourceOut.model_validate(item)


def card_out(db, item: ChampionCard, include_usage: bool = True) -> ChampionCardOut:
    usage = adopted = 0
    if include_usage:
        usage = db.scalar(select(func.count()).select_from(GenerationChampionSource).where(GenerationChampionSource.tenant_id == item.tenant_id, GenerationChampionSource.champion_card_id == item.id)) or 0
        adopted = db.scalar(select(func.count()).select_from(ChampionCardFeedback).where(ChampionCardFeedback.card_id == item.id, ChampionCardFeedback.adopted.is_(True))) or 0
    return ChampionCardOut.model_validate(item).model_copy(update={"usage_count": usage, "adopted_count": adopted})


@router.get("/sources", response_model=APIResponse[list[ChampionSourceOut]])
def list_sources(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    items = list(db.scalars(select(ChampionSource).where(ChampionSource.tenant_id == current_user.tenant_id).order_by(ChampionSource.created_at.desc())))
    return success_response([source_out(item) for item in items])


@router.post("/sources/upload", response_model=APIResponse[ChampionSourceOut], status_code=202)
async def upload_source(
    db: DbSession,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    source_type: str = Form(default="chat_export"),
    retain_original: bool = Form(default=False),
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    original = sanitize_filename(file.filename)
    extension = Path(original).suffix.lower().lstrip(".")
    if extension not in settings.champion_extension_set:
        raise AppException(415, "不支持该文件格式", "UNSUPPORTED_CHAMPION_FILE_TYPE")
    try:
        from app.models.champion import ChampionSourceType

        parsed_source_type = ChampionSourceType(source_type)
    except ValueError as exc:
        raise AppException(422, "数据源类型无效", "INVALID_CHAMPION_SOURCE_TYPE") from exc
    root = Path(settings.champion_storage_path).resolve()
    storage_key = f"{current_user.tenant_id}/{uuid4().hex}.{extension}"
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise AppException(400, "文件路径不安全", "UNSAFE_STORAGE_PATH")
    path.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0
    try:
        with path.open("xb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.champion_max_file_size_mb * 1024 * 1024:
                    raise AppException(413, "文件大小超过限制", "CHAMPION_FILE_TOO_LARGE")
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    sha256 = digest.hexdigest()
    duplicate = db.scalar(select(ChampionSource.id).where(ChampionSource.tenant_id == current_user.tenant_id, ChampionSource.sha256 == sha256))
    if duplicate:
        path.unlink(missing_ok=True)
        raise AppException(409, "相同销冠文件已经导入", "DUPLICATE_CHAMPION_FILE")
    item = ChampionSource(tenant_id=current_user.tenant_id, name=(name or Path(original).stem).strip()[:255], source_type=parsed_source_type, original_filename=original, file_extension=extension, mime_type=file.content_type or "application/octet-stream", size_bytes=size, storage_key=storage_key, sha256=sha256, retain_original=retain_original, uploaded_by_user_id=current_user.id)
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        path.unlink(missing_ok=True)
        raise AppException(409, "相同销冠文件已经导入", "DUPLICATE_CHAMPION_FILE") from exc
    try:
        preview = parse_file(path, extension, settings.champion_preview_records)
        item.preview_json = [record.values for record in preview.records]
        item.record_count = len(preview.records)
        item.status = ChampionSourceStatus.UPLOADED
        db.commit()
    except Exception as exc:
        item.status = ChampionSourceStatus.FAILED
        item.error_code = "PREVIEW_FAILED"
        item.error_message = "文件预览解析失败"
        db.commit()
        logger.info("Champion preview failed source_id=%s error=%s", item.id, type(exc).__name__)
    return success_response(source_out(item), "销冠数据源上传成功，请设置字段和角色映射")


@router.get("/sources/{source_id}", response_model=APIResponse[ChampionSourceOut])
def get_source(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    return success_response(source_out(find_source(db, source_id, current_user.tenant_id)))


@router.get("/sources/{source_id}/preview", response_model=APIResponse[ChampionPreview])
def source_preview(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    source = find_source(db, source_id, current_user.tenant_id)
    path = (Path(settings.champion_storage_path).resolve() / (source.storage_key or "")).resolve()
    if not path.is_file():
        raise AppException(404, "原始文件不存在", "CHAMPION_FILE_MISSING")
    parsed = parse_file(path, source.file_extension or "", settings.champion_preview_records)
    mapping = ChampionMapping.model_validate(source.mapping_json or {})
    mapped, needs_mapping = map_records(parsed.records, mapping, __import__("app.schemas.champion", fromlist=["ChampionRoleMapping"]).ChampionRoleMapping.model_validate(source.role_mapping_json or {}))
    redacted, count = redact_records(mapped, (source.redaction_rules_json or {}).get("custom_words", []))
    return success_response(ChampionPreview(records=mapped, redacted_records=redacted, redaction_count=count, mapping_required=needs_mapping))


@router.put("/sources/{source_id}/mapping", response_model=APIResponse[ChampionSourceOut])
def set_mapping(source_id: UUID, payload: ChampionMappingRequest, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    source = find_source(db, source_id, current_user.tenant_id)
    source.mapping_json = payload.mapping.model_dump(exclude_none=True)
    source.role_mapping_json = payload.role_mapping.model_dump()
    source.redaction_rules_json = payload.redaction_rules
    source.status = ChampionSourceStatus.UPLOADED
    source.processing_stage = "waiting"
    source.progress = 0
    db.commit()
    db.refresh(source)
    return success_response(source_out(source), "字段和角色映射已保存")


def queue_source(db, source: ChampionSource, current_user) -> None:
    from app.models.champion import ChampionImportJob

    job = ChampionImportJob(tenant_id=current_user.tenant_id, source_id=source.id)
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        task = process_champion_task.delay(str(source.id), str(current_user.tenant_id), str(job.id))
        job.celery_task_id = task.id
        db.commit()
    except Exception as exc:
        job.status = "failed"
        source.status = ChampionSourceStatus.FAILED
        source.error_code = "TASK_QUEUE_UNAVAILABLE"
        source.error_message = "异步处理队列暂时不可用，请稍后重试"
        db.commit()
        raise AppException(503, source.error_message, "TASK_QUEUE_UNAVAILABLE") from exc


@router.post("/sources/{source_id}/process", response_model=APIResponse[ChampionSourceOut], status_code=202)
def process_source(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    source = find_source(db, source_id, current_user.tenant_id)
    if not source.mapping_json or not source.role_mapping_json:
        raise AppException(409, "请先完成字段和角色映射", "CHAMPION_MAPPING_REQUIRED")
    source.status = ChampionSourceStatus.PROCESSING
    source.processing_stage = "waiting"
    source.progress = 0
    db.commit()
    queue_source(db, source, current_user)
    return success_response(source_out(source), "销冠数据已进入异步处理队列")


@router.get("/sources/{source_id}/status", response_model=APIResponse[ChampionSourceOut])
def source_status(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    return get_source(source_id, db, current_user)


@router.post("/sources/{source_id}/reprocess", response_model=APIResponse[ChampionSourceOut], status_code=202)
def reprocess_source(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    source = find_source(db, source_id, current_user.tenant_id)
    source.status = ChampionSourceStatus.PROCESSING
    source.processing_stage = "waiting"
    source.progress = 0
    source.error_code = None
    source.error_message = None
    db.commit()
    queue_source(db, source, current_user)
    return success_response(source_out(source), "已重新提交处理")


@router.patch("/sources/{source_id}/disable", response_model=APIResponse[ChampionSourceOut])
def disable_source(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    source = find_source(db, source_id, current_user.tenant_id)
    source.status = ChampionSourceStatus.DISABLED
    db.commit()
    return success_response(source_out(source), "数据源已停用")


@router.delete("/sources/{source_id}", response_model=APIResponse[dict[str, UUID]])
def delete_source(source_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    source = find_source(db, source_id, current_user.tenant_id)
    if source.status == ChampionSourceStatus.PROCESSING:
        raise AppException(409, "处理中的数据源不能删除", "CHAMPION_SOURCE_PROCESSING")
    storage_key = source.storage_key
    db.delete(source)
    db.commit()
    if storage_key:
        (Path(settings.champion_storage_path).resolve() / storage_key).unlink(missing_ok=True)
    return success_response({"id": source_id}, "数据源已删除")


@router.get("/sources/{source_id}/download")
def download_source(source_id: UUID, db: DbSession, current_user: CurrentUser):
    require_role(current_user, UserRole.ADMIN)
    source = find_source(db, source_id, current_user.tenant_id)
    if not source.retain_original:
        raise AppException(404, "原始文件未保留", "CHAMPION_ORIGINAL_NOT_RETAINED")
    path = (Path(settings.champion_storage_path).resolve() / (source.storage_key or "")).resolve()
    if not path.is_file():
        raise AppException(404, "原始文件不存在", "CHAMPION_FILE_MISSING")
    def stream():
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                yield chunk
    return StreamingResponse(stream(), media_type=source.mime_type, headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(source.original_filename or 'champion-file')}"})


@router.get("/conversations", response_model=APIResponse[list[ChampionConversationOut]])
def list_conversations(db: DbSession, current_user: CurrentUser, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    items = list(db.scalars(select(ChampionConversation).where(ChampionConversation.tenant_id == current_user.tenant_id).order_by(ChampionConversation.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
    return success_response([ChampionConversationOut.model_validate(item) for item in items])


@router.get("/conversations/{conversation_id}", response_model=APIResponse[ChampionConversationOut])
def get_conversation(conversation_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    item = db.scalar(select(ChampionConversation).where(ChampionConversation.id == conversation_id, ChampionConversation.tenant_id == current_user.tenant_id))
    if item is None:
        raise AppException(404, "销冠会话不存在", "CHAMPION_CONVERSATION_NOT_FOUND")
    return success_response(ChampionConversationOut.model_validate(item))


@router.get("/conversations/{conversation_id}/messages", response_model=APIResponse[list[ChampionMessageOut]])
def list_conversation_messages(conversation_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    get_conversation(conversation_id, db, current_user)
    items = list(db.scalars(select(ChampionMessage).where(ChampionMessage.conversation_id == conversation_id, ChampionMessage.tenant_id == current_user.tenant_id).order_by(ChampionMessage.message_index.asc())))
    return success_response([ChampionMessageOut.model_validate(item) for item in items])


@router.get("/cards", response_model=APIResponse[list[ChampionCardOut]])
def list_cards(db: DbSession, current_user: CurrentUser, status_filter: str | None = Query(None, alias="status"), card_type: str | None = None) -> dict[str, object]:
    filters = [ChampionCard.tenant_id == current_user.tenant_id]
    if current_user.role == UserRole.SALES:
        filters.append(ChampionCard.status == ChampionCardStatus.APPROVED)
    elif status_filter:
        filters.append(ChampionCard.status == status_filter)
    if card_type:
        filters.append(ChampionCard.card_type == card_type)
    items = list(db.scalars(select(ChampionCard).where(*filters).order_by(ChampionCard.created_at.desc())))
    return success_response([card_out(db, item) for item in items])


@router.post("/cards", response_model=APIResponse[ChampionCardOut], status_code=201)
def create_card(payload: ChampionCardCreate, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    if payload.source_id is not None and db.scalar(select(ChampionSource.id).where(ChampionSource.id == payload.source_id, ChampionSource.tenant_id == current_user.tenant_id)) is None:
        raise AppException(404, "销冠数据源不存在", "CHAMPION_SOURCE_NOT_FOUND")
    if payload.conversation_id is not None and db.scalar(select(ChampionConversation.id).where(ChampionConversation.id == payload.conversation_id, ChampionConversation.tenant_id == current_user.tenant_id)) is None:
        raise AppException(404, "销冠会话不存在", "CHAMPION_CONVERSATION_NOT_FOUND")
    item_data = payload.model_dump(exclude={"source_id", "conversation_id"}, mode="json")
    item_data["searchable_text"] = searchable_text(payload)
    item_data["content_hash"] = content_hash(item_data)
    item = ChampionCard(tenant_id=current_user.tenant_id, source_id=payload.source_id, conversation_id=payload.conversation_id, created_by_user_id=current_user.id, status=ChampionCardStatus.REVIEW, **item_data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return success_response(card_out(db, item), "经验卡片已创建")


@router.get("/cards/{card_id}", response_model=APIResponse[ChampionCardOut])
def get_card(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    return success_response(card_out(db, find_card(db, card_id, current_user.tenant_id)))


@router.put("/cards/{card_id}", response_model=APIResponse[ChampionCardOut])
def update_card(card_id: UUID, payload: ChampionCardUpdate, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    item = find_card(db, card_id, current_user.tenant_id)
    snapshot = ChampionCardOut.model_validate(item).model_dump(mode="json")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(item, key, value)
    item.version += 1
    item.searchable_text = searchable_text(__import__("app.schemas.champion", fromlist=["ChampionCardInput"]).ChampionCardInput.model_validate({**ChampionCardOut.model_validate(item).model_dump(), **changes}))
    item.content_hash = content_hash({"title": item.title, "customer_example": item.customer_example, "salesperson_reply": item.salesperson_reply, "strategy_summary": item.strategy_summary})
    item.embedding = None
    if item.status == ChampionCardStatus.APPROVED:
        item.status = ChampionCardStatus.REVIEW
    db.add(ChampionCardVersion(tenant_id=current_user.tenant_id, card_id=item.id, version=item.version, snapshot_json=snapshot, changed_by_user_id=current_user.id, change_reason="manual_edit"))
    db.commit()
    return success_response(card_out(db, item), "经验卡片已更新并重新进入审核")


def review_card(db, item: ChampionCard, current_user, status: ChampionCardStatus, reason: str | None = None) -> None:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    item.status = status
    item.reviewed_by_user_id = current_user.id
    item.reviewed_at = datetime.now(UTC)
    item.rejection_reason = reason
    item.version += 1
    db.add(ChampionCardVersion(tenant_id=current_user.tenant_id, card_id=item.id, version=item.version, snapshot_json=ChampionCardOut.model_validate(item).model_dump(mode="json"), changed_by_user_id=current_user.id, change_reason=status.value))
    if status == ChampionCardStatus.APPROVED:
        item.embedding = embed_card(item.searchable_text)
    else:
        item.embedding = None
    if item.source_id:
        source = db.scalar(select(ChampionSource).where(ChampionSource.id == item.source_id, ChampionSource.tenant_id == current_user.tenant_id))
        if source:
            source.approved_card_count = db.scalar(select(func.count()).select_from(ChampionCard).where(ChampionCard.source_id == source.id, ChampionCard.tenant_id == current_user.tenant_id, ChampionCard.status == ChampionCardStatus.APPROVED)) or 0
    db.commit()


@router.post("/cards/{card_id}/approve", response_model=APIResponse[ChampionCardOut])
def approve_card(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    item = find_card(db, card_id, current_user.tenant_id)
    review_card(db, item, current_user, ChampionCardStatus.APPROVED)
    return success_response(card_out(db, item), "经验卡片已批准")


@router.post("/cards/{card_id}/reject", response_model=APIResponse[ChampionCardOut])
def reject_card(card_id: UUID, db: DbSession, current_user: CurrentUser, reason: str | None = None) -> dict[str, object]:
    item = find_card(db, card_id, current_user.tenant_id)
    review_card(db, item, current_user, ChampionCardStatus.REJECTED, reason)
    return success_response(card_out(db, item), "经验卡片已拒绝")


@router.post("/cards/{card_id}/disable", response_model=APIResponse[ChampionCardOut])
def disable_card(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    item = find_card(db, card_id, current_user.tenant_id)
    item.status = ChampionCardStatus.DISABLED
    item.embedding = None
    if item.source_id:
        source = db.scalar(select(ChampionSource).where(ChampionSource.id == item.source_id, ChampionSource.tenant_id == current_user.tenant_id))
        if source:
            source.approved_card_count = db.scalar(select(func.count()).select_from(ChampionCard).where(ChampionCard.source_id == source.id, ChampionCard.tenant_id == current_user.tenant_id, ChampionCard.status == ChampionCardStatus.APPROVED)) or 0
    db.commit()
    return success_response(card_out(db, item), "经验卡片已停用")


@router.post("/cards/{card_id}/enable", response_model=APIResponse[ChampionCardOut])
def enable_card(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    item = find_card(db, card_id, current_user.tenant_id)
    item.status = ChampionCardStatus.REVIEW
    item.embedding = None
    db.commit()
    return success_response(card_out(db, item), "经验卡片已重新进入审核")


@router.post("/cards/bulk-approve", response_model=APIResponse[dict])
def bulk_approve(payload: ChampionBulkCardRequest, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    items = list(db.scalars(select(ChampionCard).where(ChampionCard.tenant_id == current_user.tenant_id, ChampionCard.id.in_(payload.card_ids))))
    if len(items) != len(payload.card_ids):
        raise AppException(404, "部分经验卡片不存在", "CHAMPION_CARD_NOT_FOUND")
    for item in items:
        review_card(db, item, current_user, ChampionCardStatus.APPROVED)
    return success_response({"approved": len(items)})


@router.post("/cards/bulk-reject", response_model=APIResponse[dict])
def bulk_reject(payload: ChampionBulkCardRequest, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    items = list(db.scalars(select(ChampionCard).where(ChampionCard.tenant_id == current_user.tenant_id, ChampionCard.id.in_(payload.card_ids))))
    if len(items) != len(payload.card_ids):
        raise AppException(404, "部分经验卡片不存在", "CHAMPION_CARD_NOT_FOUND")
    for item in items:
        review_card(db, item, current_user, ChampionCardStatus.REJECTED)
    return success_response({"rejected": len(items)})


@router.delete("/cards/{card_id}", response_model=APIResponse[dict[str, UUID]])
def delete_card(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    item = find_card(db, card_id, current_user.tenant_id)
    db.delete(item)
    db.commit()
    return success_response({"id": card_id}, "经验卡片已删除")


@router.get("/cards/{card_id}/versions", response_model=APIResponse[list[dict]])
def card_versions(card_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    find_card(db, card_id, current_user.tenant_id)
    items = list(db.scalars(select(ChampionCardVersion).where(ChampionCardVersion.card_id == card_id, ChampionCardVersion.tenant_id == current_user.tenant_id).order_by(ChampionCardVersion.version.desc())))
    return success_response([{"id": item.id, "version": item.version, "snapshot_json": item.snapshot_json, "created_at": item.created_at, "changed_by_user_id": item.changed_by_user_id} for item in items])


@router.post("/cards/{card_id}/feedback", response_model=APIResponse[dict])
def feedback(card_id: UUID, payload: ChampionFeedbackRequest, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    item = find_card(db, card_id, current_user.tenant_id)
    existing = db.scalar(select(ChampionCardFeedback).where(ChampionCardFeedback.tenant_id == current_user.tenant_id, ChampionCardFeedback.card_id == item.id, ChampionCardFeedback.user_id == current_user.id, ChampionCardFeedback.generation_id == payload.generation_id))
    if existing:
        existing.rating = payload.rating
        existing.adopted = payload.adopted
        existing.feedback_text = payload.feedback_text
    else:
        db.add(ChampionCardFeedback(tenant_id=current_user.tenant_id, card_id=item.id, user_id=current_user.id, generation_id=payload.generation_id, rating=payload.rating, adopted=payload.adopted, feedback_text=payload.feedback_text))
    db.commit()
    return success_response({"card_id": item.id, "rating": payload.rating, "adopted": payload.adopted})


@router.post("/search", response_model=APIResponse[list[ChampionSearchResult]])
def search(payload: ChampionSearchRequest, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    agent = db.scalar(select(Agent).where(Agent.tenant_id == current_user.tenant_id, Agent.is_default.is_(True)))
    config = db.scalar(select(AgentConfig).where(AgentConfig.tenant_id == current_user.tenant_id, AgentConfig.agent_id == agent.id)) if agent else None
    return success_response(search_champion(db, current_user.tenant_id, current_user.id, payload, config))


@router.get("/stats", response_model=APIResponse[ChampionStats])
def stats(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    tenant = current_user.tenant_id
    source_count = db.scalar(select(func.count()).select_from(ChampionSource).where(ChampionSource.tenant_id == tenant)) or 0
    conversation_count = db.scalar(select(func.count()).select_from(ChampionConversation).where(ChampionConversation.tenant_id == tenant)) or 0
    candidate = db.scalar(select(func.count()).select_from(ChampionCard).where(ChampionCard.tenant_id == tenant)) or 0
    review = db.scalar(select(func.count()).select_from(ChampionCard).where(ChampionCard.tenant_id == tenant, ChampionCard.status == ChampionCardStatus.REVIEW)) or 0
    approved = db.scalar(select(func.count()).select_from(ChampionCard).where(ChampionCard.tenant_id == tenant, ChampionCard.status == ChampionCardStatus.APPROVED)) or 0
    feedback_count = db.scalar(select(func.count()).select_from(ChampionCardFeedback).where(ChampionCardFeedback.tenant_id == tenant)) or 0
    adopted = db.scalar(select(func.count()).select_from(ChampionCardFeedback).where(ChampionCardFeedback.tenant_id == tenant, ChampionCardFeedback.adopted.is_(True))) or 0
    return success_response(ChampionStats(source_count=source_count, conversation_count=conversation_count, candidate_card_count=candidate, review_count=review, approved_count=approved, monthly_usage_count=0, adoption_rate=round(adopted / feedback_count, 4) if feedback_count else 0))


@router.get("/usage/summary", response_model=APIResponse[dict])
def usage_summary(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    rows = db.execute(select(ChampionCardFeedback.card_id, func.count(ChampionCardFeedback.id), func.sum(func.cast(ChampionCardFeedback.adopted, Integer))).where(ChampionCardFeedback.tenant_id == current_user.tenant_id).group_by(ChampionCardFeedback.card_id)).all()
    return success_response({"items": [{"card_id": row[0], "feedback_count": row[1], "adopted_count": row[2] or 0} for row in rows]})
