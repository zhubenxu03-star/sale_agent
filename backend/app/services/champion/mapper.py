from __future__ import annotations

from typing import Any

from app.models.champion import ChampionSenderRole
from app.schemas.champion import ChampionMapping, ChampionRoleMapping
from app.services.champion.parser import ParsedRecord


def map_records(
    records: list[ParsedRecord], mapping: ChampionMapping, role_mapping: ChampionRoleMapping
) -> tuple[list[dict[str, Any]], bool]:
    mapped: list[dict[str, Any]] = []
    needs_mapping = False
    for record in records:
        values = record.values
        def get_value(field: str | None, default: Any = None, source: dict[str, Any] = values) -> Any:
            return source.get(field) if field else default

        role_value = get_value(mapping.sender_role, values.get("sender_role"))
        role_text = str(role_value or "").strip().lower()
        if role_text in {value.lower() for value in role_mapping.customer_values}:
            role = ChampionSenderRole.CUSTOMER.value
        elif role_text in {value.lower() for value in role_mapping.salesperson_values}:
            role = ChampionSenderRole.SALESPERSON.value
        elif role_text in {value.lower() for value in role_mapping.system_values}:
            role = ChampionSenderRole.SYSTEM.value
        else:
            role = ChampionSenderRole.UNKNOWN.value
            needs_mapping = True
        content = get_value(mapping.content, values.get("content"))
        mapped.append(
            {
                "conversation_id": get_value(mapping.conversation_id, values.get("conversation_id")),
                "sender_role": role,
                "sender_name": get_value(mapping.sender_name, values.get("sender_name")),
                "content": str(content).strip() if content is not None else "",
                "timestamp": get_value(mapping.timestamp, values.get("timestamp")),
                "industry": get_value(mapping.industry, values.get("industry")),
                "sales_stage": get_value(mapping.sales_stage, values.get("sales_stage")),
                "outcome": get_value(mapping.outcome, values.get("outcome")),
                "deal_amount": get_value(mapping.deal_amount, values.get("deal_amount")),
            }
        )
    if not mapping.content and records:
        needs_mapping = True
    return mapped, needs_mapping
