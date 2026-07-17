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
        keys = sorted(set(re.findall(r"\[(K\d+)\]", combined)))
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
        cited = " [K1]" if keys else ""
        reply = (
            "感谢您的说明。为了给您更准确的方案，我先确认当前目标、使用范围和期望时间。"
            f"我们会依据已核验的企业资料进一步评估并反馈{cited}。"
        )
        payload = {
            "reply_text": reply,
            "customer_intent": "了解方案适配性并推进下一步沟通",
            "sales_stage": "needs_discovery",
            "customer_sentiment": "neutral",
            "core_needs": ["确认业务目标与适用范围"],
            "objections": ["需要更多可核验信息"] if not keys else [],
            "recommended_strategy": "先澄清关键需求，再基于企业资料提供有依据的方案",
            "next_action": "确认客户场景、范围与时间要求",
            "suggested_question": "您最希望优先解决的业务场景和期望上线时间是什么？",
            "need_human": need_human,
            "human_reason": "；".join(dict.fromkeys(reasons)) if need_human else None,
            "risk_flags": list(dict.fromkeys(risk_flags)),
            "confidence": 0.86 if keys else 0.62,
            "citations": (
                [{"citation_key": "K1", "claim": "回复参考了检索到的企业资料"}] if keys else []
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
