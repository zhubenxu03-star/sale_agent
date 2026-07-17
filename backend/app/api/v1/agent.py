import asyncio
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.agent import GenerationFeedback, GenerationRecord, GenerationStatus
from app.models.conversation import Message, SenderType
from app.models.knowledge import DocumentStatus, KnowledgeDocument
from app.models.user import UserRole
from app.schemas.agent import (
    AgentStatusOut,
    GenerationFeedbackRequest,
    GenerationListOut,
    GenerationOut,
    GenerationRequest,
    SaveGenerationMessageRequest,
    UsageSummaryOut,
)
from app.schemas.common import APIResponse, success_response
from app.schemas.conversation import MessageOut
from app.services.agent.orchestrator import generate_reply, generation_out

router = APIRouter()


@router.get("/status", response_model=APIResponse[AgentStatusOut])
def agent_status(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    settings = get_settings()
    ready = (
        db.scalar(
            select(func.count())
            .select_from(KnowledgeDocument)
            .where(
                KnowledgeDocument.tenant_id == current_user.tenant_id,
                KnowledgeDocument.status == DocumentStatus.READY,
            )
        )
        or 0
    )
    test_mode = settings.llm_provider == "test"
    configured = test_mode or (
        settings.llm_provider == "openai_compatible"
        and bool(settings.llm_base_url and settings.llm_api_key and settings.llm_model)
    )
    return success_response(
        AgentStatusOut(
            available=configured,
            provider=settings.llm_provider,
            model_name="deterministic-test-v1" if test_mode else settings.llm_model or "未配置",
            test_mode=test_mode,
            stream_enabled=settings.llm_stream_enabled,
            knowledge_ready_documents=ready,
        )
    )


@router.post("/generate", response_model=APIResponse[GenerationOut])
async def generate(
    payload: GenerationRequest, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    return success_response(
        generation_out(await generate_reply(db, current_user, payload)), "销转回复生成完成"
    )


@router.post("/generate-stream")
async def generate_stream(
    payload: GenerationRequest, db: DbSession, current_user: CurrentUser
) -> StreamingResponse:
    async def events():
        try:
            queue: asyncio.Queue[tuple[str, dict[str, object]]] = asyncio.Queue()
            task = asyncio.create_task(
                generate_reply(
                    db,
                    current_user,
                    payload,
                    progress=lambda event, data: queue.put_nowait((event, data)),
                )
            )
            while not task.done() or not queue.empty():
                try:
                    event, data = await asyncio.wait_for(queue.get(), timeout=10)
                    yield _sse(event, {**data, "request_id": payload.request_id})
                except TimeoutError:
                    yield ": heartbeat\n\n"
            record = await task
            if record.reply_text:
                for offset in range(0, len(record.reply_text), 48):
                    yield _sse(
                        "reply_delta",
                        {
                            "generation_id": str(record.id),
                            "delta": record.reply_text[offset : offset + 48],
                        },
                    )
            yield _sse("completed", generation_out(record).model_dump(mode="json"))
        except AppException as exc:
            yield _sse(
                "error",
                {"message": exc.message, "error_code": exc.error_code, "status": exc.status_code},
            )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/generations", response_model=APIResponse[GenerationListOut])
def list_generations(
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    conversation_id: UUID | None = None,
) -> dict[str, object]:
    filters = [GenerationRecord.tenant_id == current_user.tenant_id]
    if conversation_id:
        filters.append(GenerationRecord.conversation_id == conversation_id)
    total = db.scalar(select(func.count()).select_from(GenerationRecord).where(*filters)) or 0
    records = list(
        db.scalars(
            select(GenerationRecord)
            .options(selectinload(GenerationRecord.sources))
            .where(*filters)
            .order_by(GenerationRecord.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return success_response(
        GenerationListOut(
            items=[generation_out(item) for item in records],
            total=total,
            page=page,
            page_size=page_size,
        )
    )


@router.get("/generations/{generation_id}", response_model=APIResponse[GenerationOut])
def get_generation(
    generation_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    return success_response(
        generation_out(_generation_or_404(db, current_user.tenant_id, generation_id))
    )


@router.post("/generations/{generation_id}/save-message", response_model=APIResponse[MessageOut])
def save_generation_message(
    generation_id: UUID,
    payload: SaveGenerationMessageRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    record = _generation_or_404(db, current_user.tenant_id, generation_id)
    if record.status != GenerationStatus.COMPLETED:
        raise AppException(409, "仅可保存已完成的生成结果", "GENERATION_NOT_COMPLETED")
    existing = db.scalar(
        select(Message).where(
            Message.generation_id == record.id, Message.tenant_id == current_user.tenant_id
        )
    )
    if existing:
        return success_response(MessageOut.model_validate(existing), "该回复已保存")
    if record.need_human and not payload.confirmed_human_review:
        raise AppException(409, "该回复需人工确认后才能保存", "HUMAN_REVIEW_REQUIRED")
    edited = payload.reply_text.strip() != (record.reply_text or "").strip()
    message = Message(
        tenant_id=current_user.tenant_id,
        conversation_id=record.conversation_id,
        sender_type=SenderType.ASSISTANT,
        content=payload.reply_text.strip(),
        generation_id=record.id,
        is_ai_generated=True,
        is_user_edited=edited,
        metadata_json={
            "generation_id": str(record.id),
            "citations": [
                {
                    "citation_key": item.citation_key,
                    "citation_label": item.citation_label,
                    "content_snapshot": item.content_snapshot,
                }
                for item in record.sources
                if item.used_in_reply
            ],
            "human_review_confirmed": payload.confirmed_human_review,
        },
    )
    db.add(message)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(Message).where(
                Message.generation_id == record.id,
                Message.tenant_id == current_user.tenant_id,
            )
        )
        if existing is None:
            raise
        return success_response(MessageOut.model_validate(existing), "该回复已保存")
    db.refresh(message)
    return success_response(MessageOut.model_validate(message), "回复已保存到会话")


@router.post("/generations/{generation_id}/feedback", response_model=APIResponse[dict[str, object]])
def save_feedback(
    generation_id: UUID,
    payload: GenerationFeedbackRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    record = _generation_or_404(db, current_user.tenant_id, generation_id)
    feedback = db.scalar(
        select(GenerationFeedback).where(
            GenerationFeedback.tenant_id == current_user.tenant_id,
            GenerationFeedback.generation_id == record.id,
            GenerationFeedback.user_id == current_user.id,
        )
    )
    if feedback is None:
        feedback = GenerationFeedback(
            tenant_id=current_user.tenant_id,
            generation_id=record.id,
            user_id=current_user.id,
            rating=payload.rating,
        )
        db.add(feedback)
    feedback.rating = payload.rating
    feedback.adopted = payload.adopted
    feedback.edited_before_save = payload.edited_before_save
    feedback.feedback_text = payload.feedback_text
    db.commit()
    return success_response(
        {"generation_id": record.id, "rating": feedback.rating, "adopted": feedback.adopted},
        "反馈已保存",
    )


@router.get("/usage/summary", response_model=APIResponse[UsageSummaryOut])
def usage_summary(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    now = datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = today.replace(day=1)
    filters = [GenerationRecord.tenant_id == current_user.tenant_id]
    if current_user.role == UserRole.SALES:
        filters.append(GenerationRecord.created_by_user_id == current_user.id)
    row = db.execute(
        select(
            func.count().filter(GenerationRecord.created_at >= today),
            func.count().filter(GenerationRecord.created_at >= month),
            func.coalesce(
                func.sum(GenerationRecord.total_tokens).filter(
                    GenerationRecord.created_at >= today
                ),
                0,
            ),
            func.coalesce(
                func.sum(GenerationRecord.total_tokens).filter(
                    GenerationRecord.created_at >= month
                ),
                0,
            ),
            func.sum(case((GenerationRecord.status == GenerationStatus.COMPLETED, 1), else_=0)),
            func.sum(case((GenerationRecord.status == GenerationStatus.FAILED, 1), else_=0)),
            func.coalesce(func.avg(GenerationRecord.duration_ms), 0),
        ).where(*filters)
    ).one()
    return success_response(
        UsageSummaryOut(
            today_generations=row[0] or 0,
            month_generations=row[1] or 0,
            today_tokens=row[2] or 0,
            month_tokens=row[3] or 0,
            successful=row[4] or 0,
            failed=row[5] or 0,
            average_duration_ms=float(row[6] or 0),
        )
    )


def _generation_or_404(db: DbSession, tenant_id: UUID, generation_id: UUID) -> GenerationRecord:
    record = db.scalar(
        select(GenerationRecord)
        .options(selectinload(GenerationRecord.sources))
        .where(GenerationRecord.id == generation_id, GenerationRecord.tenant_id == tenant_id)
    )
    if record is None:
        raise AppException(404, "生成记录不存在", "GENERATION_NOT_FOUND")
    return record


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
