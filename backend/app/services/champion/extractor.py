from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from collections.abc import Sequence
from typing import Any

from app.core.config import settings
from app.services.champion.validator import validate_card
from app.services.llm.factory import get_chat_provider
from app.services.llm.schemas import ChatMessage, GenerationSettings


class ChampionExtractor(ABC):
    @abstractmethod
    async def extract(self, messages: Sequence[dict[str, Any]]) -> list[dict[str, Any]]: ...


class DeterministicTestChampionExtractor(ChampionExtractor):
    async def extract(self, messages: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        customer = next((item for item in messages if item.get("sender_role") == "customer"), None)
        salesperson = next((item for item in messages if item.get("sender_role") == "salesperson"), None)
        if not customer or not salesperson:
            return []
        content = str(customer.get("content") or "")
        reply = str(salesperson.get("content") or "")
        if len(content) < 2 or not reply:
            return []
        if not re.search(r"价格|预算|贵|竞品|周期|方案|考虑|优惠|折扣|投诉", content):
            return []
        card_type = "objection_handling" if re.search(r"价格|预算|贵|竞品|优惠|折扣", content) else "needs_discovery"
        card = {
            "title": "价格异议的价值重构" if card_type == "objection_handling" else "顾问式需求追问",
            "card_type": card_type,
            "applicable_industries": [str(customer.get("industry"))] if customer.get("industry") else [],
            "applicable_sales_stages": [str(customer.get("sales_stage"))] if customer.get("sales_stage") else ["quotation", "negotiation"],
            "applicable_customer_sentiments": ["hesitant"],
            "trigger_patterns": [content[:40]],
            "customer_intent": "确认价值并降低购买风险",
            "customer_objection": content[:200],
            "customer_example": content,
            "salesperson_reply": reply,
            "strategy_summary": "先共情确认顾虑，再澄清目标与边界，最后引导下一步验证。",
            "why_it_works": "避免直接争论，将沟通转向客户目标、风险和可验证的结果。",
            "recommended_next_action": "确认预算边界、关键目标和决策时间。",
            "suggested_question": "您当前最希望优先解决哪一项业务问题？",
            "tone_tags": ["顾问式", "克制", "共情"],
            "risk_notes": ["不得自行承诺折扣或未经企业知识支持的效果"],
            "outcome": "effective",
            "quality_score": 78,
        }
        return [validate_card(card).model_dump(mode="json")]


class LLMChampionExtractor(ChampionExtractor):
    async def extract(self, messages: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
        text = "\n".join(f"{item.get('sender_role')}: {item.get('content')}" for item in messages)
        text = text[: settings.champion_max_input_chars]
        schema = {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["title", "card_type", "customer_example", "salesperson_reply", "strategy_summary", "why_it_works"],
            },
        }
        provider = get_chat_provider()
        response = await provider.generate(
            [
                ChatMessage(role="system", content="Extract only redacted, reusable sales methods. Never return personal data or enterprise facts."),
                ChatMessage(role="user", content=f"<REDACTED_CHAT>\n{text}\n</REDACTED_CHAT>"),
            ],
            GenerationSettings(temperature=0, max_output_tokens=3000, json_schema=schema),
        )
        try:
            payload = json.loads(response.content)
        except json.JSONDecodeError:
            repaired = await provider.generate(
                [ChatMessage(role="user", content=f"Repair this into valid JSON array only:\n{response.content[:settings.champion_max_input_chars]}")],
                GenerationSettings(temperature=0, max_output_tokens=3000, json_schema=schema),
            )
            payload = json.loads(repaired.content)
        if not isinstance(payload, list):
            raise ValueError("champion extractor response must be a list")
        return [validate_card(item).model_dump(mode="json") for item in payload[: settings.champion_max_cards_per_conversation]]


def get_champion_extractor() -> ChampionExtractor:
    if settings.champion_extractor_provider == "test":
        if settings.app_env.lower() == "production":
            raise RuntimeError("production cannot use deterministic champion extractor")
        return DeterministicTestChampionExtractor()
    if settings.champion_extractor_provider == "llm":
        return LLMChampionExtractor()
    raise RuntimeError(f"unsupported champion extractor: {settings.champion_extractor_provider}")
