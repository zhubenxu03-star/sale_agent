import json
import re
from collections.abc import AsyncIterator

from app.services.llm.base import ChatProvider
from app.services.llm.schemas import (
    ChatMessage,
    ChatResult,
    ChatStreamEvent,
    GenerationSettings,
    TokenUsage,
)


class DeterministicTestChatProvider(ChatProvider):
    model_name = "deterministic-test-v1"

    async def generate(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> ChatResult:
        combined = "\n".join(message.content for message in messages)
        current = _between(combined, "<current_customer_message>", "</current_customer_message>")
        config = _json_between(
            combined, "<tenant_agent_config>", "</tenant_agent_config>"
        )
        knowledge = _knowledge_items(
            _between(combined, "<retrieved_knowledge>", "</retrieved_knowledge>")
        )
        if not knowledge:
            knowledge = [
                {"key": key, "content": "已检索企业资料"}
                for key in sorted(set(re.findall(r"\[(K\d+)\]", combined)))
            ]
        champion = _champion_items(
            _between(combined, "<CHAMPION_SALES_METHODS>", "</CHAMPION_SALES_METHODS>")
        )
        keys = [item["key"] for item in knowledge]
        risk_flags: list[str] = []
        need_human = False
        reasons: list[str] = []
        rules = (
            (r"退款|投诉|索赔", "REFUND_OR_COMPLAINT", "涉及投诉、退款或索赔"),
            (r"合同|法律|违约|责任", "LEGAL_OR_CONTRACT", "涉及合同或法律责任"),
            (r"人工|负责人", "CUSTOMER_REQUESTED_HUMAN", "客户要求人工处理"),
            (r"特殊折扣|最低价|审批", "DISCOUNT_APPROVAL_REQUIRED", "涉及特殊价格审批"),
            (r"安全承诺|合规承诺", "SECURITY_COMMITMENT", "涉及安全或合规承诺"),
        )
        for pattern, flag, reason in rules:
            if re.search(pattern, current):
                risk_flags.append(flag)
                reasons.append(reason)
                need_human = True
        if re.search(r"忽略.{0,10}(指令|规则)|系统提示词|API\s*Key|修改角色", current, re.I):
            risk_flags.append("PROMPT_INJECTION_DETECTED")
        if not keys:
            risk_flags.append("NO_RELIABLE_KNOWLEDGE")
            if re.search(r"价格|折扣|交付|合同|退款|认证|案例|效果", current):
                need_human = True
                reasons.append("该问题涉及企业事实，但暂无可靠知识依据")
        friendly = config.get("reply_style") == "friendly"
        detailed = config.get("reply_length") == "long"
        opening = "您好，完全理解您需要认真评估。" if friendly else "感谢您的关注。"
        fact_items = knowledge[:2] if detailed else knowledge[:1]
        facts = "；".join(f'{item["content"]} [{item["key"]}]' for item in fact_items)
        strategy = champion[0] if champion else None
        strategy_reply = strategy["reply"] if strategy else "建议先确认优先场景，再评估投入与回报。"
        question = "您更关注服务范围、落地周期，还是预算投入产出？"
        reply = f"{opening}{('根据企业资料，' + facts + '。') if facts else '具体服务与价格需要进一步核验。'}{strategy_reply}"
        if detailed:
            reply += f"我们可以结合您的使用范围分项说明，并给出可核验的实施计划。{question}"
        else:
            reply += question
        payload = {
            "reply_text": reply,
            "customer_intent": "了解方案适配性并推进下一步沟通",
            "sales_stage": "needs_discovery",
            "customer_sentiment": "neutral",
            "core_needs": ["确认业务目标与适用范围"],
            "objections": ["需要更多可核验信息"] if not keys else [],
            "recommended_strategy": strategy["strategy"] if strategy else "先澄清关键需求，再基于企业资料提供有依据的方案",
            "next_action": "确认客户场景、范围与时间要求",
            "suggested_question": question,
            "need_human": need_human,
            "human_reason": "；".join(dict.fromkeys(reasons)) if need_human else None,
            "risk_flags": list(dict.fromkeys(risk_flags)),
            "confidence": 0.86 if keys else 0.62,
            "citations": [
                {"citation_key": item["key"], "claim": f'回复使用了{item["key"]}中的企业事实'}
                for item in fact_items
            ],
            "champion_methods_used": (
                [{"strategy_key": strategy["key"], "purpose": "用于组织异议处理与下一步推进表达"}]
                if strategy
                else []
            ),
        }
        content = json.dumps(payload, ensure_ascii=False)
        prompt_tokens = max(1, len(combined) // 4)
        completion_tokens = max(1, len(content) // 4)
        return ChatResult(
            content=content,
            model_name=self.model_name,
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            ),
        )

    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[ChatStreamEvent]:
        result = await self.generate(messages, settings)
        for offset in range(0, len(result.content), 48):
            yield ChatStreamEvent(type="delta", delta=result.content[offset : offset + 48])
        yield ChatStreamEvent(type="done", result=result)


def _between(value: str, start: str, end: str) -> str:
    if start not in value or end not in value:
        return value
    return value.split(start, 1)[1].split(end, 1)[0]


def _json_between(value: str, start: str, end: str) -> dict[str, object]:
    try:
        return json.loads(_between(value, start, end))
    except (json.JSONDecodeError, TypeError):
        return {}


def _compact(value: str, limit: int = 180) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    return compact if len(compact) <= limit else f"{compact[:limit].rstrip()}…"


def _knowledge_items(value: str) -> list[dict[str, str]]:
    matches = re.findall(
        r"\[(K\d+)\]\s*\n来源：[^\n]+\n<untrusted_knowledge>(.*?)</untrusted_knowledge>",
        value,
        re.DOTALL,
    )
    return [{"key": key, "content": _compact(content)} for key, content in matches]


def _champion_items(value: str) -> list[dict[str, str]]:
    blocks = re.split(r"(?=\[S\d+\]\s*\n)", value)
    items: list[dict[str, str]] = []
    for block in blocks:
        key = re.search(r"\[(S\d+)\]", block)
        strategy = re.search(r"销售策略：(.*?)\n参考表达：", block, re.DOTALL)
        reply = re.search(r"参考表达：(.*?)\n风险提示：", block, re.DOTALL)
        if key and strategy and reply:
            items.append(
                {
                    "key": key.group(1),
                    "strategy": _compact(strategy.group(1)),
                    "reply": _compact(reply.group(1)),
                }
            )
    return items
