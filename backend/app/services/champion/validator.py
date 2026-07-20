from __future__ import annotations

from app.schemas.champion import ChampionCardInput


def validate_card(payload: dict) -> ChampionCardInput:
    return ChampionCardInput.model_validate(payload)


def searchable_text(card: ChampionCardInput) -> str:
    return " ".join(
        [
            card.title,
            card.card_type.value,
            *card.applicable_industries,
            *card.applicable_sales_stages,
            *card.applicable_customer_sentiments,
            *card.trigger_patterns,
            card.customer_intent or "",
            card.customer_objection or "",
            card.customer_example,
            card.salesperson_reply,
            card.strategy_summary,
            card.why_it_works,
            *(card.tone_tags or []),
        ]
    ).strip()
