from __future__ import annotations

import logging
from math import ceil
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.knowledge import (
    DocumentStatus,
    KnowledgeBase,
    KnowledgeBaseStatus,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeProcessingJob,
    ProcessingJobStatus,
    ProcessingStage,
)
from app.models.user import User, UserRole
from app.schemas.common import APIResponse, success_response
from app.schemas.knowledge import (
    KnowledgeBaseCreate,
    KnowledgeBaseOut,
    KnowledgeBaseUpdate,
    KnowledgeChunkOut,
    KnowledgeChunkPage,
    KnowledgeDocumentOut,
    KnowledgeDocumentPage,
    KnowledgeSearchData,
    KnowledgeSearchRequest,
)
from app.services.knowledge.embeddings import get_embedding_provider
from app.services.knowledge.retrieval import search_knowledge
from app.services.knowledge.storage import delete_stored_file, resolve_storage_key, save_upload
from app.tasks.knowledge_tasks import process_document_task

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/config", response_model=APIResponse[dict[str, str]])
def knowledge_config(current_user: CurrentUser) -> dict[str, object]:
    del current_user
    provider = get_embedding_provider()
    return success_response({"embedding_mode": provider.mode})


def require_role(user: User, *roles: UserRole) -> None:
    if user.role not in roles:
        raise AppException(403, "权限不足", "KNOWLEDGE_PERMISSION_DENIED")


def find_base(db: Session, base_id: UUID, tenant_id: UUID) -> KnowledgeBase:
    item = db.scalar(
        select(KnowledgeBase).where(
            KnowledgeBase.id == base_id, KnowledgeBase.tenant_id == tenant_id
        )
    )
    if item is None:
        raise AppException(404, "知识库不存在", "KNOWLEDGE_BASE_NOT_FOUND")
    return item


def find_document(db: Session, document_id: UUID, tenant_id: UUID) -> KnowledgeDocument:
    item = db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.tenant_id == tenant_id,
        )
    )
    if item is None:
        raise AppException(404, "知识文件不存在", "KNOWLEDGE_DOCUMENT_NOT_FOUND")
    return item


def base_out(db: Session, item: KnowledgeBase) -> KnowledgeBaseOut:
    document_count = (
        db.scalar(
            select(func.count())
            .select_from(KnowledgeDocument)
            .where(
                KnowledgeDocument.tenant_id == item.tenant_id,
                KnowledgeDocument.knowledge_base_id == item.id,
            )
        )
        or 0
    )
    ready_count = (
        db.scalar(
            select(func.count())
            .select_from(KnowledgeDocument)
            .where(
                KnowledgeDocument.tenant_id == item.tenant_id,
                KnowledgeDocument.knowledge_base_id == item.id,
                KnowledgeDocument.status == DocumentStatus.READY,
            )
        )
        or 0
    )
    chunk_count = (
        db.scalar(
            select(func.count())
            .select_from(KnowledgeChunk)
            .where(
                KnowledgeChunk.tenant_id == item.tenant_id,
                KnowledgeChunk.knowledge_base_id == item.id,
            )
        )
        or 0
    )
    return KnowledgeBaseOut.model_validate(item).model_copy(
        update={
            "document_count": document_count,
            "ready_document_count": ready_count,
            "chunk_count": chunk_count,
        }
    )


def document_out(item: KnowledgeDocument, uploader_name: str | None = None) -> KnowledgeDocumentOut:
    return KnowledgeDocumentOut.model_validate(item).model_copy(
        update={"uploaded_by_name": uploader_name}
    )


def queue_job(db: Session, document: KnowledgeDocument, job: KnowledgeProcessingJob) -> None:
    try:
        task = process_document_task.delay(str(document.id), str(document.tenant_id), str(job.id))
        job.celery_task_id = task.id
        db.commit()
    except Exception as exc:
        document.status = DocumentStatus.FAILED
        document.processing_stage = ProcessingStage.FAILED
        document.error_code = "TASK_QUEUE_UNAVAILABLE"
        document.error_message = "异步处理服务暂时不可用，请稍后重新处理"
        job.status = ProcessingJobStatus.FAILED
        job.error_message = document.error_message
        db.commit()
        logger.error(
            "Failed to queue knowledge task tenant_id=%s document_id=%s job_id=%s",
            document.tenant_id,
            document.id,
            job.id,
        )
        raise AppException(503, document.error_message, "TASK_QUEUE_UNAVAILABLE") from exc


@router.get("/bases", response_model=APIResponse[list[KnowledgeBaseOut]])
def list_bases(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    items = list(
        db.scalars(
            select(KnowledgeBase)
            .where(KnowledgeBase.tenant_id == current_user.tenant_id)
            .order_by(KnowledgeBase.created_at.asc())
        )
    )
    return success_response([base_out(db, item) for item in items])


@router.post(
    "/bases", response_model=APIResponse[KnowledgeBaseOut], status_code=status.HTTP_201_CREATED
)
def create_base(
    payload: KnowledgeBaseCreate, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    item = KnowledgeBase(
        tenant_id=current_user.tenant_id,
        name=payload.name.strip(),
        description=payload.description,
        created_by_user_id=current_user.id,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppException(409, "同名知识库已存在", "KNOWLEDGE_BASE_NAME_CONFLICT") from exc
    db.refresh(item)
    return success_response(base_out(db, item), "知识库创建成功")


@router.get("/bases/{base_id}", response_model=APIResponse[KnowledgeBaseOut])
def get_base(base_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    return success_response(base_out(db, find_base(db, base_id, current_user.tenant_id)))


@router.put("/bases/{base_id}", response_model=APIResponse[KnowledgeBaseOut])
def update_base(
    base_id: UUID,
    payload: KnowledgeBaseUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    item = find_base(db, base_id, current_user.tenant_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppException(409, "同名知识库已存在", "KNOWLEDGE_BASE_NAME_CONFLICT") from exc
    db.refresh(item)
    return success_response(base_out(db, item), "知识库更新成功")


@router.delete("/bases/{base_id}", response_model=APIResponse[dict[str, UUID]])
def delete_base(base_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    item = find_base(db, base_id, current_user.tenant_id)
    keys = list(
        db.scalars(
            select(KnowledgeDocument.storage_key).where(
                KnowledgeDocument.tenant_id == current_user.tenant_id,
                KnowledgeDocument.knowledge_base_id == item.id,
            )
        )
    )
    db.delete(item)
    db.commit()
    for key in keys:
        try:
            delete_stored_file(key)
        except OSError:
            logger.exception("Failed to delete knowledge file base_id=%s", base_id)
    return success_response({"id": base_id}, "知识库删除成功")


@router.get("/documents", response_model=APIResponse[KnowledgeDocumentPage])
def list_documents(
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    knowledge_base_id: UUID | None = None,
    status_filter: DocumentStatus | None = Query(default=None, alias="status"),
) -> dict[str, object]:
    filters = [KnowledgeDocument.tenant_id == current_user.tenant_id]
    if knowledge_base_id is not None:
        find_base(db, knowledge_base_id, current_user.tenant_id)
        filters.append(KnowledgeDocument.knowledge_base_id == knowledge_base_id)
    if current_user.role == UserRole.SALES:
        filters.append(KnowledgeDocument.status == DocumentStatus.READY)
    elif status_filter is not None:
        filters.append(KnowledgeDocument.status == status_filter)
    total = db.scalar(select(func.count()).select_from(KnowledgeDocument).where(*filters)) or 0
    rows = db.execute(
        select(KnowledgeDocument, User.name)
        .join(User, User.id == KnowledgeDocument.uploaded_by_user_id)
        .where(*filters)
        .order_by(KnowledgeDocument.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [document_out(document, uploader_name) for document, uploader_name in rows]
    return success_response(
        KnowledgeDocumentPage.build(items=items, page=page, page_size=page_size, total=total)
    )


@router.post(
    "/documents/upload",
    response_model=APIResponse[KnowledgeDocumentOut],
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_document(
    db: DbSession,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    knowledge_base_id: UUID = Form(...),
    display_name: str | None = Form(default=None, max_length=255),
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    base = find_base(db, knowledge_base_id, current_user.tenant_id)
    if base.status != KnowledgeBaseStatus.ACTIVE:
        raise AppException(409, "知识库已停用", "KNOWLEDGE_BASE_DISABLED")
    stored = await save_upload(file, current_user.tenant_id)
    duplicate = db.scalar(
        select(KnowledgeDocument.id).where(
            KnowledgeDocument.tenant_id == current_user.tenant_id,
            KnowledgeDocument.knowledge_base_id == base.id,
            KnowledgeDocument.sha256 == stored.sha256,
        )
    )
    if duplicate is not None:
        delete_stored_file(stored.storage_key)
        raise AppException(409, "同一知识库中已存在相同文件", "DUPLICATE_KNOWLEDGE_FILE")
    document = KnowledgeDocument(
        tenant_id=current_user.tenant_id,
        knowledge_base_id=base.id,
        original_filename=stored.original_filename,
        display_name=(display_name or "").strip() or stored.display_name,
        file_extension=stored.extension,
        mime_type=stored.mime_type,
        size_bytes=stored.size_bytes,
        storage_key=stored.storage_key,
        sha256=stored.sha256,
        uploaded_by_user_id=current_user.id,
    )
    db.add(document)
    try:
        db.flush()
        job = KnowledgeProcessingJob(
            tenant_id=current_user.tenant_id,
            document_id=document.id,
        )
        db.add(job)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        delete_stored_file(stored.storage_key)
        raise AppException(409, "同一知识库中已存在相同文件", "DUPLICATE_KNOWLEDGE_FILE") from exc
    db.refresh(document)
    db.refresh(job)
    queue_job(db, document, job)
    return success_response(document_out(document, current_user.name), "文件上传成功，等待异步处理")


@router.get("/documents/{document_id}", response_model=APIResponse[KnowledgeDocumentOut])
def get_document(document_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    document = find_document(db, document_id, current_user.tenant_id)
    if current_user.role == UserRole.SALES and document.status != DocumentStatus.READY:
        raise AppException(404, "知识文件不存在", "KNOWLEDGE_DOCUMENT_NOT_FOUND")
    uploader = db.scalar(select(User.name).where(User.id == document.uploaded_by_user_id))
    return success_response(document_out(document, uploader))


@router.get("/documents/{document_id}/status", response_model=APIResponse[KnowledgeDocumentOut])
def get_document_status(
    document_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    return get_document(document_id, db, current_user)


@router.get("/documents/{document_id}/download")
def download_document(document_id: UUID, db: DbSession, current_user: CurrentUser):
    document = find_document(db, document_id, current_user.tenant_id)
    if current_user.role == UserRole.SALES and document.status != DocumentStatus.READY:
        raise AppException(404, "知识文件不存在", "KNOWLEDGE_DOCUMENT_NOT_FOUND")
    path = resolve_storage_key(document.storage_key)
    if not path.is_file():
        raise AppException(404, "原文件不存在", "KNOWLEDGE_FILE_MISSING")

    def stream():
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                yield chunk

    encoded = quote(document.original_filename)
    return StreamingResponse(
        stream(),
        media_type=document.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded}",
            "Content-Length": str(path.stat().st_size),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/documents/{document_id}/reprocess", response_model=APIResponse[KnowledgeDocumentOut])
def reprocess_document(
    document_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    document = find_document(db, document_id, current_user.tenant_id)
    document.status = DocumentStatus.UPLOADED
    document.processing_stage = ProcessingStage.WAITING
    document.progress = 0
    document.error_code = None
    document.error_message = None
    job = KnowledgeProcessingJob(tenant_id=current_user.tenant_id, document_id=document.id)
    db.add(job)
    db.commit()
    db.refresh(job)
    queue_job(db, document, job)
    return success_response(document_out(document), "已提交重新处理任务")


@router.patch("/documents/{document_id}/disable", response_model=APIResponse[KnowledgeDocumentOut])
def disable_document(
    document_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    document = find_document(db, document_id, current_user.tenant_id)
    document.status = DocumentStatus.DISABLED
    db.commit()
    db.refresh(document)
    return success_response(document_out(document), "文件已停用")


@router.patch("/documents/{document_id}/enable", response_model=APIResponse[KnowledgeDocumentOut])
def enable_document(
    document_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    document = find_document(db, document_id, current_user.tenant_id)
    if document.chunk_count <= 0:
        raise AppException(409, "文件尚无可用知识片段，请先重新处理", "DOCUMENT_NOT_READY")
    document.status = DocumentStatus.READY
    document.processing_stage = ProcessingStage.COMPLETED
    document.progress = 100
    db.commit()
    db.refresh(document)
    return success_response(document_out(document), "文件已启用")


@router.delete("/documents/{document_id}", response_model=APIResponse[dict[str, UUID]])
def delete_document(
    document_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN)
    document = find_document(db, document_id, current_user.tenant_id)
    storage_key = document.storage_key
    db.delete(document)
    db.commit()
    try:
        delete_stored_file(storage_key)
    except OSError as exc:
        logger.exception(
            "Failed to delete physical knowledge file tenant_id=%s document_id=%s",
            current_user.tenant_id,
            document_id,
        )
        raise AppException(
            500, "数据库记录已删除，但物理文件清理失败", "FILE_DELETE_FAILED"
        ) from exc
    return success_response({"id": document_id}, "知识文件已删除")


@router.get("/documents/{document_id}/chunks", response_model=APIResponse[KnowledgeChunkPage])
def list_chunks(
    document_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    require_role(current_user, UserRole.ADMIN, UserRole.MANAGER)
    document = find_document(db, document_id, current_user.tenant_id)
    filters = [
        KnowledgeChunk.tenant_id == current_user.tenant_id,
        KnowledgeChunk.document_id == document.id,
    ]
    total = db.scalar(select(func.count()).select_from(KnowledgeChunk).where(*filters)) or 0
    chunks = list(
        db.scalars(
            select(KnowledgeChunk)
            .where(*filters)
            .order_by(KnowledgeChunk.chunk_index.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return success_response(
        KnowledgeChunkPage(
            items=[KnowledgeChunkOut.model_validate(item) for item in chunks],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=ceil(total / page_size) if total else 0,
        )
    )


@router.post("/search", response_model=APIResponse[KnowledgeSearchData])
def search(
    payload: KnowledgeSearchRequest, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    return success_response(
        search_knowledge(db, current_user.tenant_id, current_user.id, payload), "检索成功"
    )
