from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.session import SessionLocal
from app.models.knowledge import (
    DocumentStatus,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeProcessingJob,
    ProcessingJobStatus,
    ProcessingStage,
)
from app.services.knowledge.chunker import build_chunks
from app.services.knowledge.embeddings import EmbeddingProvider, get_embedding_provider
from app.services.knowledge.errors import KnowledgeProcessingError
from app.services.knowledge.parser import parse_document
from app.services.knowledge.storage import resolve_storage_key

logger = logging.getLogger(__name__)


def _stage(
    db: Session,
    document: KnowledgeDocument,
    stage: ProcessingStage,
    progress: int,
) -> None:
    document.status = DocumentStatus.PROCESSING
    document.processing_stage = stage
    document.progress = progress
    document.error_code = None
    document.error_message = None
    db.commit()


def process_knowledge_document(
    document_id: UUID,
    tenant_id: UUID,
    job_id: UUID,
    *,
    provider: EmbeddingProvider | None = None,
    session_factory: sessionmaker = SessionLocal,
) -> dict[str, object]:
    db = session_factory()
    try:
        document = db.scalar(
            select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id,
                KnowledgeDocument.tenant_id == tenant_id,
            )
        )
        job = db.scalar(
            select(KnowledgeProcessingJob).where(
                KnowledgeProcessingJob.id == job_id,
                KnowledgeProcessingJob.document_id == document_id,
                KnowledgeProcessingJob.tenant_id == tenant_id,
            )
        )
        if document is None or job is None:
            raise KnowledgeProcessingError("DOCUMENT_NOT_FOUND", "待处理文档不存在")
        if job.status == ProcessingJobStatus.SUCCESS and document.status == DocumentStatus.READY:
            return {"document_id": str(document_id), "status": "ready", "idempotent": True}

        job.status = ProcessingJobStatus.RUNNING
        job.attempt_count += 1
        job.started_at = datetime.now(UTC)
        job.finished_at = None
        job.error_message = None
        db.commit()

        _stage(db, document, ProcessingStage.PARSING, 15)
        sections = parse_document(
            resolve_storage_key(document.storage_key), document.file_extension
        )

        _stage(db, document, ProcessingStage.CHUNKING, 35)
        chunks = build_chunks(sections)

        _stage(db, document, ProcessingStage.EMBEDDING, 55)
        embedding_provider = provider or get_embedding_provider()
        vectors = embedding_provider.embed_texts([chunk.content for chunk in chunks])
        embedding_provider.validate([chunk.content for chunk in chunks], vectors)

        _stage(db, document, ProcessingStage.SAVING, 85)
        db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
        for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
            db.add(
                KnowledgeChunk(
                    tenant_id=tenant_id,
                    knowledge_base_id=document.knowledge_base_id,
                    document_id=document.id,
                    chunk_index=index,
                    content=chunk.content,
                    content_hash=chunk.content_hash,
                    token_count=chunk.token_count,
                    page_number=chunk.page_number,
                    sheet_name=chunk.sheet_name,
                    row_start=chunk.row_start,
                    row_end=chunk.row_end,
                    section_title=chunk.section_title,
                    metadata_json=chunk.metadata,
                    embedding=vector,
                )
            )
        document.status = DocumentStatus.READY
        document.processing_stage = ProcessingStage.COMPLETED
        document.progress = 100
        document.chunk_count = len(chunks)
        document.processed_at = datetime.now(UTC)
        document.error_code = None
        document.error_message = None
        job.status = ProcessingJobStatus.SUCCESS
        job.finished_at = datetime.now(UTC)
        db.commit()
        return {"document_id": str(document_id), "status": "ready", "chunks": len(chunks)}
    except Exception as exc:
        db.rollback()
        code = exc.code if isinstance(exc, KnowledgeProcessingError) else "PROCESSING_FAILED"
        message = (
            exc.message
            if isinstance(exc, KnowledgeProcessingError)
            else "文档处理失败，请检查文件内容后重新处理"
        )
        failed_document = db.scalar(
            select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id,
                KnowledgeDocument.tenant_id == tenant_id,
            )
        )
        failed_job = db.scalar(
            select(KnowledgeProcessingJob).where(
                KnowledgeProcessingJob.id == job_id,
                KnowledgeProcessingJob.tenant_id == tenant_id,
            )
        )
        if failed_document is not None:
            failed_document.status = DocumentStatus.FAILED
            failed_document.processing_stage = ProcessingStage.FAILED
            failed_document.error_code = code
            failed_document.error_message = message
        if failed_job is not None:
            failed_job.status = ProcessingJobStatus.FAILED
            failed_job.finished_at = datetime.now(UTC)
            failed_job.error_message = message
        db.commit()
        logger.error(
            "Knowledge processing failed tenant_id=%s document_id=%s job_id=%s code=%s",
            tenant_id,
            document_id,
            job_id,
            code,
        )
        return {"document_id": str(document_id), "status": "failed", "error_code": code}
    finally:
        db.close()
