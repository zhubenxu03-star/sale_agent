"""Draft/published configuration helpers shared by API and generation paths."""

from copy import deepcopy
from types import SimpleNamespace
from typing import Any

from app.models.agent import AgentConfig, ReplyLength, ReplyStyle, SalesAggressiveness

CONFIG_FIELDS = (
    "agent_name",
    "identity_prompt",
    "reply_style",
    "reply_length",
    "sales_aggressiveness",
    "allow_emoji",
    "default_top_k",
    "default_min_score",
    "temperature",
    "max_output_tokens",
    "require_citations",
    "enterprise_knowledge_enabled",
    "prohibited_claims",
    "human_handoff_rules",
    "custom_instructions",
    "champion_enabled",
    "champion_top_k",
    "champion_min_score",
    "champion_industry_weight",
    "champion_stage_weight",
    "champion_success_weight",
    "champion_admin_score_weight",
    "champion_semantic_weight",
    "champion_prefer_tenant",
    "champion_allow_general_generation",
)


def snapshot_config(config: AgentConfig) -> dict[str, Any]:
    """Serialize only editable business settings, never IDs or timestamps."""

    result: dict[str, Any] = {}
    for field in CONFIG_FIELDS:
        value = getattr(config, field)
        result[field] = value.value if hasattr(value, "value") else deepcopy(value)
    return result


def draft_snapshot(config: AgentConfig) -> dict[str, Any]:
    return config.draft_config_json or snapshot_config(config)


def effective_config(config: AgentConfig, *, published: bool = True) -> Any:
    """Return a detached config view so generation never mutates the ORM draft."""

    values = snapshot_config(config)
    version = config.draft_version or config.version
    if published and config.published_config_json:
        values.update(deepcopy(config.published_config_json))
        version = config.published_version or version
    values.update(
        {
            "id": config.id,
            "agent_id": config.agent_id,
            "tenant_id": config.tenant_id,
            "version": version,
            "draft_version": config.draft_version or config.version,
            "published_version": config.published_version,
        }
    )
    values["reply_style"] = ReplyStyle(values["reply_style"])
    values["reply_length"] = ReplyLength(values["reply_length"])
    values["sales_aggressiveness"] = SalesAggressiveness(values["sales_aggressiveness"])
    return SimpleNamespace(**values)
