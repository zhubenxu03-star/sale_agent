from __future__ import annotations

import time
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.models.knowledge import (
    DocumentStatus,
    KnowledgeBase,
    KnowledgeBaseStatus,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeRetrievalLog,
)
from app.schemas.knowledge import KnowledgeSearchData, KnowledgeSearchRequest, KnowledgeSearchResult
from app.services.knowledge.embeddings import EmbeddingProvider, get_embedding_provider
from app.services.knowledge.errors import KnowledgeProcessingError


def citation(document_name: str, chunk: KnowledgeChunk) -> str:
    locations: list[str] = []
    if chunk.page_number is not None:
        locations.append(f"第{chunk.page_number}页")
    if chunk.sheet_name:
        locations.append(f"工作表“{chunk.sheet_name}”")
    if chunk.row_start is not None:
        row_label = (
            f"第{chunk.row_start}行"
            if chunk.row_end in (None, chunk.row_start)
            else f"第{chunk.row_start}-{chunk.row_end}行"
        )
        locations.append(row_label)
    return "，".join([document_name, *locations])


def search_knowledge(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    payload: KnowledgeSearchRequest,
    provider: EmbeddingProvider | None = None,
) -> KnowledgeSearchData:
    started = time.perf_counter()
    if payload.knowledge_base_id is not None:
        knowledge_base = db.scalar(
            select(KnowledgeBase).where(
                KnowledgeBase.id == payload.knowledge_base_id,
                KnowledgeBase.tenant_id == tenant_id,
            )
        )
        if knowledge_base is None:
            raise AppException(404, "知识库不存在", "KNOWLEDGE_BASE_NOT_FOUND")

    embedding_provider = provider or get_embedding_provider()
    try:
        query_vector = embedding_provider.embed_texts([payload.query.strip()])[0]
    except KnowledgeProcessingError as exc:
        raise AppException(503, exc.message, exc.code) from exc

    distance = KnowledgeChunk.embedding.cosine_distance(query_vector).label("distance")
    filters = [
        KnowledgeChunk.tenant_id == tenant_id,
        KnowledgeDocument.tenant_id == tenant_id,
        KnowledgeDocument.status == DocumentStatus.READY,
        KnowledgeBase.tenant_id == tenant_id,
        KnowledgeBase.status == KnowledgeBaseStatus.ACTIVE,
    ]
    if payload.knowledge_base_id is not None:
        filters.append(KnowledgeChunk.knowledge_base_id == payload.knowledge_base_id)
    rows = db.execute(
        select(KnowledgeChunk, KnowledgeDocument.original_filename, distance)
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .join(KnowledgeBase, KnowledgeBase.id == KnowledgeChunk.knowledge_base_id)
        .where(*filters)
        .order_by(distance.asc())
        .limit(payload.top_k * 3)
    ).all()

    results: list[KnowledgeSearchResult] = []
    for chunk, document_name, raw_distance in rows:
        score = max(0.0, min(1.0, 1.0 - float(raw_distance)))
        if score < payload.min_score:
            continue
        results.append(
            KnowledgeSearchResult(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_name=document_name,
                content=chunk.content,
                score=round(score, 4),
                page_number=chunk.page_number,
                sheet_name=chunk.sheet_name,
                row_start=chunk.row_start,
                row_end=chunk.row_end,
                section_title=chunk.section_title,
                citation_label=citation(document_name, chunk),
            )
        )
        if len(results) >= payload.top_k:
            break

    duration_ms = round((time.perf_counter() - started) * 1000)
    db.add(
        KnowledgeRetrievalLog(
            tenant_id=tenant_id,
            user_id=user_id,
            knowledge_base_id=payload.knowledge_base_id,
            query=payload.query.strip(),
            result_count=len(results),
            top_score=results[0].score if results else None,
            duration_ms=duration_ms,
            embedding_provider=embedding_provider.name,
        )
    )
    db.commit()
    return KnowledgeSearchData(
        query=payload.query.strip(),
        results=results,
        embedding_mode=embedding_provider.mode,
        duration_ms=duration_ms,
    )
