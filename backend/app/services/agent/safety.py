import re

from app.schemas.agent import AgentOutput, RiskFlag

INJECTION_PATTERN = re.compile(
    r"忽略.{0,16}(之前|以上|系统|规则|指令)|系统提示词|泄露.{0,8}(密钥|API\s*Key)|"
    r"修改.{0,8}角色|扮演.{0,8}(系统|开发者)|输出.{0,8}tenant_id",
    re.IGNORECASE,
)

RULES: tuple[tuple[re.Pattern[str], RiskFlag, str], ...] = (
    (re.compile(r"投诉|退款|索赔"), RiskFlag.REFUND_OR_COMPLAINT, "涉及投诉、退款或索赔"),
    (re.compile(r"合同|法律|违约|责任"), RiskFlag.LEGAL_OR_CONTRACT, "涉及合同或法律责任"),
    (
        re.compile(r"人工|负责人|真人"),
        RiskFlag.CUSTOMER_REQUESTED_HUMAN,
        "客户要求人工或负责人处理",
    ),
    (
        re.compile(r"特殊折扣|最低价|价格审批"),
        RiskFlag.DISCOUNT_APPROVAL_REQUIRED,
        "涉及特殊折扣或价格审批",
    ),
    (
        re.compile(r"安全承诺|合规承诺|保证合规"),
        RiskFlag.SECURITY_COMMITMENT,
        "涉及安全或合规承诺",
    ),
)

FACT_PATTERN = re.compile(r"价格|报价|折扣|付款|交付|合同|退款|认证|资质|案例|效果|百分比")


def apply_safety_rules(
    output: AgentOutput,
    customer_message: str,
    has_knowledge: bool,
    injection_text: str | None = None,
) -> AgentOutput:
    flags = list(output.risk_flags)
    reasons: list[str] = [output.human_reason] if output.human_reason else []
    need_human = output.need_human
    for pattern, flag, reason in RULES:
        if pattern.search(customer_message):
            flags.append(flag)
            reasons.append(reason)
            need_human = True
    if INJECTION_PATTERN.search(injection_text or customer_message):
        flags.append(RiskFlag.PROMPT_INJECTION_DETECTED)
    if not has_knowledge:
        flags.append(RiskFlag.NO_RELIABLE_KNOWLEDGE)
        if FACT_PATTERN.search(customer_message):
            reasons.append("该问题涉及企业事实，但暂无可靠知识依据")
            need_human = True
    if output.confidence < 0.5:
        flags.append(RiskFlag.LOW_CONFIDENCE)
        reasons.append("模型置信度较低")
        need_human = True
    return output.model_copy(
        update={
            "risk_flags": list(dict.fromkeys(flags)),
            "need_human": need_human,
            "human_reason": "；".join(dict.fromkeys(reasons)) if need_human else None,
        }
    )


def validate_citations(output: AgentOutput, valid_keys: set[str]) -> AgentOutput:
    citations = [item for item in output.citations if item.citation_key in valid_keys]
    return output.model_copy(update={"citations": citations})
