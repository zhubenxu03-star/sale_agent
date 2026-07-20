from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.champion import (
    ChampionCard,
    ChampionCardStatus,
    ChampionConversation,
    ChampionConversationOutcome,
    ChampionImportJob,
    ChampionJobStatus,
    ChampionMessage,
    ChampionProcessingStage,
    ChampionSenderRole,
    ChampionSource,
    ChampionSourceStatus,
)
from app.services.champion.deduplicator import content_hash
from app.services.champion.extractor import get_champion_extractor
from app.services.champion.mapper import map_records
from app.services.champion.parser import parse_file
from app.services.champion.redactor import redact_records
from app.services.champion.segmenter import segment_records
from app.services.champion.validator import searchable_text

logger = logging.getLogger(__name__)


def _set_stage(db: Session, source: ChampionSource, stage: ChampionProcessingStage, progress: int) -> None:
    source.status = ChampionSourceStatus.PROCESSING
    source.processing_stage = stage
    source.progress = progress
    db.commit()


async def process_champion_source_async(
    source_id: UUID,
    tenant_id: UUID,
    job_id: UUID,
    *,
    session_factory: sessionmaker = SessionLocal,
) -> dict[str, Any]:
    db = session_factory()
    try:
        source = db.scalar(select(ChampionSource).where(ChampionSource.id == source_id, ChampionSource.tenant_id == tenant_id))
        job = db.scalar(select(ChampionImportJob).where(ChampionImportJob.id == job_id, ChampionImportJob.source_id == source_id, ChampionImportJob.tenant_id == tenant_id))
        if source is None or job is None:
            return {"status": "failed", "error_code": "CHAMPION_SOURCE_NOT_FOUND"}
        if job.status == ChampionJobStatus.SUCCESS and source.status in {ChampionSourceStatus.READY, ChampionSourceStatus.REVIEW_REQUIRED}:
            return {"status": "success", "idempotent": True}
        if not source.storage_key:
            return {"status": "failed", "error_code": "SOURCE_FILE_MISSING"}
        job.status = ChampionJobStatus.RUNNING
        job.attempt_count += 1
        job.started_at = datetime.now(UTC)
        db.commit()
        path = (Path(settings.champion_storage_path).resolve() / source.storage_key).resolve()
        if path != Path(settings.champion_storage_path).resolve() and Path(settings.champion_storage_path).resolve() not in path.parents:
            raise ValueError("unsafe champion storage path")
        _set_stage(db, source, ChampionProcessingStage.PARSING, 10)
        parsed = parse_file(path, source.file_extension or "", settings.champion_preview_records)
        mapping = source.mapping_json or {}
        role_mapping = source.role_mapping_json or {}
        mapped, needs_mapping = map_records(parsed.records, mapping=type("Mapping", (), mapping)() if False else __import__("app.schemas.champion", fromlist=["ChampionMapping"]).ChampionMapping.model_validate(mapping), role_mapping=__import__("app.schemas.champion", fromlist=["ChampionRoleMapping"]).ChampionRoleMapping.model_validate(role_mapping))
        if needs_mapping:
            source.status = ChampionSourceStatus.MAPPING_REQUIRED
            source.processing_stage = ChampionProcessingStage.ROLE_MAPPING
            source.progress = 20
            source.preview_json = mapped[: settings.champion_preview_records]
            db.commit()
            return {"status": "mapping_required"}
        source.record_count = len(mapped)
        _set_stage(db, source, ChampionProcessingStage.REDACTING, 30)
        redacted, redaction_count = redact_records(mapped, (source.redaction_rules_json or {}).get("custom_words", []))
        source.redaction_count = redaction_count
        source.preview_json = redacted[: settings.champion_preview_records]
        _set_stage(db, source, ChampionProcessingStage.SEGMENTING, 45)
        groups = segment_records(redacted)
        source.conversation_count = len(groups)
        _set_stage(db, source, ChampionProcessingStage.EXTRACTING, 55)
        extractor = get_champion_extractor()
        db.execute(delete(ChampionCard).where(ChampionCard.tenant_id == tenant_id, ChampionCard.source_id == source.id, ChampionCard.status != ChampionCardStatus.APPROVED))
        db.execute(delete(ChampionConversation).where(ChampionConversation.tenant_id == tenant_id, ChampionConversation.source_id == source.id))
        for group_index, group in enumerate(groups):
            conversation_key = str(group[0].get("conversation_id") or f"source-{source.id}-conversation-{group_index}")
            conversation = ChampionConversation(
                tenant_id=tenant_id,
                source_id=source.id,
                external_conversation_key=conversation_key,
                title=f"脱敏会话 {group_index + 1}",
                salesperson_alias="[销售姓名]",
                customer_alias="[客户姓名]",
                industry=group[0].get("industry"),
                outcome=ChampionConversationOutcome(str(group[0].get("outcome") or "unknown")) if str(group[0].get("outcome") or "unknown") in {item.value for item in ChampionConversationOutcome} else ChampionConversationOutcome.UNKNOWN,
                deal_amount=float(group[0]["deal_amount"]) if group[0].get("deal_amount") not in (None, "") else None,
                message_count=len(group),
                metadata_json={"sales_stage": group[0].get("sales_stage")},
            )
            db.add(conversation)
            db.flush()
            for index, item in enumerate(group):
                db.add(ChampionMessage(tenant_id=tenant_id, conversation_id=conversation.id, message_index=index, sender_role=ChampionSenderRole(str(item.get("sender_role") or "unknown")), sender_alias=item.get("sender_alias"), content_redacted=item["content"], occurred_at=None, redaction_flags=item.get("redaction_flags", []), metadata_json={"industry": item.get("industry"), "sales_stage": item.get("sales_stage")}))
            cards = await extractor.extract(group)
            for card_data in cards:
                card_data["source_id"] = source.id
                card_data["conversation_id"] = conversation.id
                from app.schemas.champion import ChampionCardInput

                card_data["searchable_text"] = searchable_text(
                    ChampionCardInput.model_validate(
                        {
                            key: value
                            for key, value in card_data.items()
                            if key not in {"source_id", "conversation_id"}
                        }
                    )
                )
                card_hash = content_hash(card_data)
                existing = db.scalar(select(ChampionCard).where(ChampionCard.tenant_id == tenant_id, ChampionCard.content_hash == card_hash))
                if existing:
                    continue
                db.add(ChampionCard(tenant_id=tenant_id, source_id=source.id, conversation_id=conversation.id, title=card_data["title"], card_type=card_data["card_type"], applicable_industries=card_data.get("applicable_industries", []), applicable_sales_stages=card_data.get("applicable_sales_stages", []), applicable_customer_sentiments=card_data.get("applicable_customer_sentiments", []), trigger_patterns=card_data.get("trigger_patterns", []), customer_intent=card_data.get("customer_intent"), customer_objection=card_data.get("customer_objection"), customer_example=card_data["customer_example"], salesperson_reply=card_data["salesperson_reply"], strategy_summary=card_data["strategy_summary"], why_it_works=card_data["why_it_works"], recommended_next_action=card_data.get("recommended_next_action"), suggested_question=card_data.get("suggested_question"), tone_tags=card_data.get("tone_tags", []), risk_notes=card_data.get("risk_notes", []), outcome=card_data.get("outcome", "unknown"), historical_success_rate=card_data.get("historical_success_rate"), quality_score=card_data.get("quality_score", 0), admin_score=card_data.get("admin_score"), searchable_text=card_data["searchable_text"], content_hash=card_hash, status=ChampionCardStatus.REVIEW, created_by_user_id=source.uploaded_by_user_id))
        db.flush()
        source.candidate_card_count = db.query(ChampionCard).filter(
            ChampionCard.tenant_id == tenant_id,
            ChampionCard.source_id == source.id,
        ).count()
        source.status = ChampionSourceStatus.REVIEW_REQUIRED if source.candidate_card_count else ChampionSourceStatus.READY
        source.processing_stage = ChampionProcessingStage.COMPLETED
        source.progress = 100
        source.processed_at = datetime.now(UTC)
        job.status = ChampionJobStatus.SUCCESS
        job.finished_at = datetime.now(UTC)
        db.commit()
        if not source.retain_original:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.exception("Failed to delete champion original tenant_id=%s source_id=%s", tenant_id, source_id)
        return {"status": "success", "conversation_count": len(groups), "candidate_card_count": source.candidate_card_count}
    except Exception as exc:
        db.rollback()
        source = db.scalar(select(ChampionSource).where(ChampionSource.id == source_id, ChampionSource.tenant_id == tenant_id))
        job = db.scalar(select(ChampionImportJob).where(ChampionImportJob.id == job_id, ChampionImportJob.tenant_id == tenant_id))
        if source:
            source.status = ChampionSourceStatus.FAILED
            source.processing_stage = ChampionProcessingStage.FAILED
            source.error_code = "CHAMPION_PROCESSING_FAILED"
            source.error_message = "销冠数据处理失败，请检查映射和文件内容"
        if job:
            job.status = ChampionJobStatus.FAILED
            job.error_message = str(exc)[:500]
            job.finished_at = datetime.now(UTC)
        db.commit()
        logger.error("Champion processing failed tenant_id=%s source_id=%s", tenant_id, source_id, exc_info=True)
        return {"status": "failed", "error_code": "CHAMPION_PROCESSING_FAILED"}
    finally:
        db.close()


def process_champion_source(
    source_id: UUID,
    tenant_id: UUID,
    job_id: UUID,
    *,
    session_factory: sessionmaker = SessionLocal,
) -> dict[str, Any]:
    import asyncio

    return asyncio.run(
        process_champion_source_async(
            source_id, tenant_id, job_id, session_factory=session_factory
        )
    )
