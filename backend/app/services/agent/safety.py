import re

from app.schemas.agent import AgentOutput, RiskFlag

INJECTION_PATTERN = re.compile(
    r"忽略.{0,16}(之前|以上|系统|规则|指令)|系统提示词|泄露.{0,8}(密钥|API\s*Key)|"
    r"修改.{0,8}角色|扮演.{0,8}(系统|开发者)|输出.{0,8}tenant_id|"
    r"(?:输出|告诉|展示|公开|透露|泄露).{0,12}(?:内部|系统|隐藏|开发者).{0,6}(?:规则|指令|提示词)|"
    r"(?:内部|系统|隐藏|开发者).{0,8}(?:规则|指令|提示词).{0,8}(?:告诉|输出|展示|公开|透露)",
    re.IGNORECASE,
)

RULES: tuple[tuple[re.Pattern[str], RiskFlag, str], ...] = (
    (re.compile(r"合同|法律|违约|责任"), RiskFlag.LEGAL_OR_CONTRACT, "涉及合同或法律责任"),
    (
        re.compile(r"人工|负责人|真人"),
        RiskFlag.CUSTOMER_REQUESTED_HUMAN,
        "客户要求人工或负责人处理",
    ),
)

FACT_PATTERN = re.compile(r"价格|报价|折扣|付款|交付|合同|退款|认证|资质|案例|效果|百分比")
DISCOUNT_REQUEST_PATTERN = re.compile(
    r"(?:给我|帮我|直接|能不能|可不可以|能给|可以给|能否给|是否能给|申请|要求).{0,12}"
    r"(?:打[一二三四五六七八九十0-9]+折|折扣|优惠|特殊价格|最低价|降价|便宜)|"
    r"(?:打[一二三四五六七八九十0-9]+折|折扣|优惠|特殊价格|最低价|降价|便宜)"
    r".{0,12}(?:可以吗|能不能|行不行|申请|批准)|"
    r"价格.{0,10}(?:能不能|可不可以|可以).{0,8}(?:优惠|打折|调整|降低)"
)
REFUND_REQUEST_PATTERN = re.compile(
    r"投诉|(?:我要|要求|申请|现在|立即|给我|必须).{0,12}(?:退款|赔偿|赔付|索赔)|"
    r"(?:退款|赔偿|赔付|索赔).{0,8}(?:申请|处理|投诉|现在|立即)"
)
DELIVERY_TOPIC_PATTERN = re.compile(r"交付|上线|实施周期|交付日期|上线日期")
DELIVERY_COMMITMENT_PATTERN = re.compile(
    r"(?:保证|承诺|确保|必须|能不能|可以不可以).{0,20}(?:交付|上线)|"
    r"(?:交付|上线).{0,20}(?:保证|承诺|确保|必须|[一二三四五六七八九十0-9]+天内)"
)
ABSOLUTE_EFFECT_PATTERN = re.compile(
    r"(?:保证|承诺|确保|百分之百|绝对|一定).{0,20}(?:效果|成交|收益)|"
    r"(?:效果|成交|收益).{0,20}(?:保证|承诺|确保|百分之百|绝对)"
)
SECURITY_COMMITMENT_PATTERN = re.compile(
    r"(?:保证|承诺|确保|绝对|百分之百|永远).{0,24}(?:安全|合规|数据.{0,6}泄露|泄露)|"
    r"(?:安全|合规|数据.{0,6}泄露|泄露).{0,24}(?:保证|承诺|确保|绝对|百分之百|永远)"
)
HUMAN_REQUEST_PATTERN = re.compile(r"人工|负责人|真人")


def apply_safety_rules(
    output: AgentOutput,
    customer_message: str,
    has_knowledge: bool,
    injection_text: str | None = None,
    prohibited_claims: list[str] | None = None,
    human_handoff_rules: list[str] | None = None,
) -> AgentOutput:
    flags = _validated_model_flags(output, customer_message, has_knowledge)
    reasons: list[str] = [output.human_reason] if output.human_reason else []
    need_human = output.need_human
    for pattern, flag, reason in RULES:
        if pattern.search(customer_message):
            flags.append(flag)
            reasons.append(reason)
            need_human = True
    contextual_rules = (
        (
            REFUND_REQUEST_PATTERN,
            RiskFlag.REFUND_OR_COMPLAINT,
            "涉及投诉、退款或索赔请求",
        ),
        (
            DISCOUNT_REQUEST_PATTERN,
            RiskFlag.DISCOUNT_APPROVAL_REQUIRED,
            "涉及非标准折扣或价格审批请求",
        ),
        (
            SECURITY_COMMITMENT_PATTERN,
            RiskFlag.SECURITY_COMMITMENT,
            "涉及绝对安全或合规承诺",
        ),
    )
    for pattern, flag, reason in contextual_rules:
        if pattern.search(customer_message):
            flags.append(flag)
            reasons.append(reason)
            need_human = True
    if _is_nonstandard_delivery_request(customer_message):
        flags.append(RiskFlag.DELIVERY_COMMITMENT)
        reasons.append("涉及非标准交付日期承诺")
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
    for rule in prohibited_claims or []:
        matched_flag = _configured_rule_flag(
            rule, customer_message, output.reply_text, has_knowledge
        )
        if matched_flag is not None:
            flags.append(matched_flag)
            reasons.append(f"命中禁止承诺规则：{rule}")
            need_human = True
    for rule in human_handoff_rules or []:
        if _handoff_rule_matches(rule, customer_message, output, has_knowledge):
            reasons.append(f"命中人工接管规则：{rule}")
            need_human = True
    return output.model_copy(
        update={
            "risk_flags": list(dict.fromkeys(flags)),
            "need_human": need_human,
            "human_reason": "；".join(dict.fromkeys(reasons)) if need_human else None,
        }
    )


def apply_champion_risk_notes(
    output: AgentOutput, customer_message: str, risk_notes: list[str]
) -> AgentOutput:
    if not risk_notes:
        return output
    combined_risks = "\n".join(risk_notes)
    flags = list(output.risk_flags)
    reasons: list[str] = [output.human_reason] if output.human_reason else []
    need_human = output.need_human
    if DISCOUNT_REQUEST_PATTERN.search(customer_message) and re.search(
        r"价格|折扣|优惠|审批", combined_risks
    ):
        flags.append(RiskFlag.DISCOUNT_APPROVAL_REQUIRED)
        reasons.append("销冠经验提示该折扣或价格请求需要人工确认")
        need_human = True
    if _is_nonstandard_delivery_request(customer_message) and re.search(
        r"交付|周期|上线|承诺", combined_risks
    ):
        flags.append(RiskFlag.DELIVERY_COMMITMENT)
        reasons.append("销冠经验提示该交付承诺需要人工确认")
        need_human = True
    if ABSOLUTE_EFFECT_PATTERN.search(customer_message) and re.search(
        r"效果|收益|成交|承诺", combined_risks
    ):
        flags.append(RiskFlag.SECURITY_COMMITMENT)
        reasons.append("销冠经验提示该效果承诺需要人工确认")
        need_human = True
    return output.model_copy(
        update={
            "risk_flags": list(dict.fromkeys(flags)),
            "need_human": need_human,
            "human_reason": "；".join(dict.fromkeys(reasons)) if need_human else None,
        }
    )


def _validated_model_flags(
    output: AgentOutput, customer_message: str, has_knowledge: bool
) -> list[RiskFlag]:
    validated: list[RiskFlag] = []
    for flag in output.risk_flags:
        if (
            flag == RiskFlag.DISCOUNT_APPROVAL_REQUIRED
            and not DISCOUNT_REQUEST_PATTERN.search(customer_message)
        ):
            continue
        if flag == RiskFlag.DELIVERY_COMMITMENT and not _is_nonstandard_delivery_request(
            customer_message
        ):
            continue
        if (
            flag == RiskFlag.PRICE_UNVERIFIED
            and has_knowledge
            and bool(output.citations)
        ):
            continue
        if (
            flag == RiskFlag.CUSTOMER_REQUESTED_HUMAN
            and not HUMAN_REQUEST_PATTERN.search(customer_message)
        ):
            continue
        if (
            flag == RiskFlag.REFUND_OR_COMPLAINT
            and not REFUND_REQUEST_PATTERN.search(customer_message)
        ):
            continue
        if flag == RiskFlag.PROMPT_INJECTION_DETECTED and not INJECTION_PATTERN.search(
            customer_message
        ):
            continue
        if flag == RiskFlag.SECURITY_COMMITMENT and not (
            SECURITY_COMMITMENT_PATTERN.search(customer_message)
            or ABSOLUTE_EFFECT_PATTERN.search(f"{customer_message}\n{output.reply_text}")
            or re.search(r"虚构|伪造|假冒|不存在的", output.reply_text)
        ):
            continue
        validated.append(flag)
    return validated


def _configured_rule_flag(
    rule: str, customer_message: str, reply_text: str, has_knowledge: bool
) -> RiskFlag | None:
    checked_text = f"{customer_message}\n{reply_text}"
    if re.search(r"价格|折扣|最低价|优惠", rule) and DISCOUNT_REQUEST_PATTERN.search(
        customer_message
    ):
        return RiskFlag.DISCOUNT_APPROVAL_REQUIRED
    if re.search(r"交付|周期|上线", rule) and (
        _is_nonstandard_delivery_request(customer_message)
        or (not has_knowledge and DELIVERY_TOPIC_PATTERN.search(customer_message))
    ):
        return RiskFlag.DELIVERY_COMMITMENT
    if re.search(r"效果|收益|成交|保证", rule) and ABSOLUTE_EFFECT_PATTERN.search(
        checked_text
    ):
        return RiskFlag.SECURITY_COMMITMENT
    if re.search(r"退款|赔偿|赔付", rule) and REFUND_REQUEST_PATTERN.search(
        customer_message
    ):
        return RiskFlag.REFUND_OR_COMPLAINT
    if re.search(r"合同|法律|合规", rule) and re.search(
        r"合同|法律|合规|违约|责任", customer_message
    ):
        return RiskFlag.LEGAL_OR_CONTRACT
    if re.search(r"虚构|案例|认证|资质|服务能力", rule) and re.search(
        r"虚构|伪造|假冒|不存在的", checked_text
    ):
        return RiskFlag.SECURITY_COMMITMENT
    normalized = re.sub(r"[，。；、：:,.\s]", "", rule)
    if len(normalized) >= 4 and normalized in re.sub(r"\s", "", checked_text):
        return RiskFlag.SECURITY_COMMITMENT
    return None


def _handoff_rule_matches(
    rule: str, customer_message: str, output: AgentOutput, has_knowledge: bool
) -> bool:
    mappings = (
        (r"合同|法律|合规", r"合同|法律|合规|违约|责任"),
        (r"要求人工|人工接管", r"人工|负责人|真人"),
        (r"高价值", r"高价值|大单|百万|千万"),
    )
    if re.search(r"投诉|退款|索赔", rule) and REFUND_REQUEST_PATTERN.search(
        customer_message
    ):
        return True
    if re.search(r"特殊价格|价格审批|折扣", rule) and DISCOUNT_REQUEST_PATTERN.search(
        customer_message
    ):
        return True
    if re.search(r"安全|合规", rule) and SECURITY_COMMITMENT_PATTERN.search(
        customer_message
    ):
        return True
    if re.search(r"没有可靠知识|无可靠(?:企业)?知识", rule) and not has_knowledge:
        return True
    if re.search(r"低置信度", rule) and output.confidence < 0.5:
        return True
    if re.search(r"Prompt\s*Injection|敏感信息|提示词|密钥", rule, re.IGNORECASE) and (
        INJECTION_PATTERN.search(customer_message)
    ):
        return True
    if re.search(r"非标准交付|交付日期|上线日期", rule) and _is_nonstandard_delivery_request(
        customer_message
    ):
        return True
    return any(
        re.search(rule_pattern, rule) and re.search(message_pattern, customer_message)
        for rule_pattern, message_pattern in mappings
    )


def _is_nonstandard_delivery_request(customer_message: str) -> bool:
    return bool(
        DELIVERY_TOPIC_PATTERN.search(customer_message)
        and DELIVERY_COMMITMENT_PATTERN.search(customer_message)
    )


def validate_citations(output: AgentOutput, valid_keys: set[str]) -> AgentOutput:
    citations = [item for item in output.citations if item.citation_key in valid_keys]
    return output.model_copy(update={"citations": citations})
