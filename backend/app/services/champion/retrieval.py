from __future__ import annotations

import math
import time
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agent import AgentConfig
from app.models.champion import ChampionCard, ChampionCardStatus, ChampionRetrievalLog
from app.schemas.champion import ChampionSearchRequest, ChampionSearchResult
from app.services.champion.embeddings import embed_card


def _score(card: ChampionCard, query: str, payload: ChampionSearchRequest, config: AgentConfig) -> tuple[float, ...]:
    q = set(query.lower())
    t = set(card.searchable_text.lower())
    semantic = len(q & t) / max(1, len(q))
    if card.embedding:
        query_vector = embed_card(query)
        numerator = sum(a * b for a, b in zip(query_vector, card.embedding, strict=False))
        card_norm = math.sqrt(sum(value * value for value in card.embedding)) or 1.0
        query_norm = math.sqrt(sum(value * value for value in query_vector)) or 1.0
        semantic = max(0.0, min(1.0, numerator / (card_norm * query_norm)))
    industry = 1.0 if payload.industry and payload.industry in (card.applicable_industries or []) else 0.0
    stage = 1.0 if payload.sales_stage and payload.sales_stage in (card.applicable_sales_stages or []) else 0.0
    success = float(card.historical_success_rate or 0)
    admin = float(card.admin_score or card.quality_score or 0) / 100
    final = max(0.0, min(1.0, semantic * config.champion_semantic_weight + industry * config.champion_industry_weight + stage * config.champion_stage_weight + success * config.champion_success_weight + admin * config.champion_admin_score_weight))
    return semantic, industry, stage, success, admin, final


def search_champion(
    db: Session, tenant_id: UUID, user_id: UUID, payload: ChampionSearchRequest, config: AgentConfig | None = None
) -> list[ChampionSearchResult]:
    started = time.perf_counter()
    if config is None:
        class _Config:
            champion_top_k = payload.top_k
            champion_min_score = payload.min_score
            champion_semantic_weight = 0.50
            champion_industry_weight = 0.15
            champion_stage_weight = 0.15
            champion_success_weight = 0.10
            champion_admin_score_weight = 0.10

        config = _Config()  # type: ignore[assignment]
    top_k = min(payload.top_k, max(1, config.champion_top_k), 10)
    cards = list(db.scalars(select(ChampionCard).where(ChampionCard.tenant_id == tenant_id, ChampionCard.status == ChampionCardStatus.APPROVED)))
    ranked: list[tuple[ChampionCard, tuple[float, ...]]] = []
    for card in cards:
        scores = _score(card, payload.query, payload, config)
        if scores[-1] >= max(payload.min_score, config.champion_min_score):
            ranked.append((card, scores))
    ranked.sort(key=lambda item: item[1][-1], reverse=True)
    results: list[ChampionSearchResult] = []
    for _index, (card, scores) in enumerate(ranked[: top_k * 3]):
        if any(item.card_type == card.card_type and sum(1 for item in results if item.card_type == card.card_type) >= 2 for item in results):
            continue
        results.append(ChampionSearchResult.model_validate(card).model_copy(update={
            "strategy_key": f"S{len(results) + 1}",
            "semantic_score": round(scores[0], 4),
            "industry_score": round(scores[1], 4),
            "stage_score": round(scores[2], 4),
            "success_score": round(scores[3], 4),
            "admin_score_value": round(scores[4], 4),
            "final_score": round(scores[5], 4),
        }))
        if len(results) >= top_k:
            break
    duration_ms = round((time.perf_counter() - started) * 1000)
    db.add(ChampionRetrievalLog(tenant_id=tenant_id, user_id=user_id, customer_id=payload.customer_id, conversation_id=payload.conversation_id, query=payload.query, result_count=len(results), top_score=results[0].final_score if results else None, duration_ms=duration_ms, filters_json=payload.model_dump(mode="json")))
    db.commit()
    return results
