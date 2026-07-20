from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.champion import (
    ChampionCardOutcome,
    ChampionCardStatus,
    ChampionCardType,
    ChampionFeedbackRating,
    ChampionSourceStatus,
    ChampionSourceType,
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class ChampionMapping(StrictModel):
    conversation_id: str | None = None
    sender_role: str | None = None
    sender_name: str | None = None
    content: str | None = None
    timestamp: str | None = None
    industry: str | None = None
    sales_stage: str | None = None
    outcome: str | None = None
    deal_amount: str | None = None


class ChampionRoleMapping(StrictModel):
    customer_values: list[str] = Field(default_factory=lambda: ["customer", "客户"])
    salesperson_values: list[str] = Field(default_factory=lambda: ["salesperson", "sales", "销售"])
    system_values: list[str] = Field(default_factory=lambda: ["system", "系统"])


class ChampionSourceUpload(StrictModel):
    name: str | None = Field(default=None, max_length=255)
    source_type: ChampionSourceType = ChampionSourceType.CHAT_EXPORT
    retain_original: bool = False


class ChampionSourceOut(StrictModel):
    id: UUID
    name: str
    source_type: ChampionSourceType
    original_filename: str | None
    file_extension: str | None
    mime_type: str | None
    size_bytes: int | None
    sha256: str | None
    retain_original: bool
    status: ChampionSourceStatus
    processing_stage: str
    progress: int
    record_count: int
    conversation_count: int
    candidate_card_count: int
    approved_card_count: int
    redaction_count: int
    error_code: str | None
    error_message: str | None
    uploaded_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None


class ChampionMappingRequest(StrictModel):
    mapping: ChampionMapping
    role_mapping: ChampionRoleMapping = Field(default_factory=ChampionRoleMapping)
    redaction_rules: dict[str, Any] = Field(default_factory=dict)


class ChampionPreview(StrictModel):
    records: list[dict[str, Any]]
    redacted_records: list[dict[str, Any]]
    redaction_count: int
    mapping_required: bool


class ChampionMessageOut(StrictModel):
    id: UUID
    message_index: int
    sender_role: str
    sender_alias: str | None
    content_redacted: str
    occurred_at: datetime | None
    redaction_flags: list[str]


class ChampionConversationOut(StrictModel):
    id: UUID
    source_id: UUID
    external_conversation_key: str | None
    title: str | None
    salesperson_alias: str
    customer_alias: str
    industry: str | None
    outcome: str
    deal_amount: float | None
    started_at: datetime | None
    ended_at: datetime | None
    message_count: int
    redaction_status: str
    created_at: datetime


class ChampionCardInput(StrictModel):
    title: str = Field(min_length=1, max_length=500)
    card_type: ChampionCardType
    applicable_industries: list[str] = Field(default_factory=list)
    applicable_sales_stages: list[str] = Field(default_factory=list)
    applicable_customer_sentiments: list[str] = Field(default_factory=list)
    trigger_patterns: list[str] = Field(default_factory=list)
    customer_intent: str | None = None
    customer_objection: str | None = None
    customer_example: str = Field(min_length=1)
    salesperson_reply: str = Field(min_length=1)
    strategy_summary: str = Field(min_length=1)
    why_it_works: str = Field(min_length=1)
    recommended_next_action: str | None = None
    suggested_question: str | None = None
    tone_tags: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    outcome: ChampionCardOutcome = ChampionCardOutcome.UNKNOWN
    historical_success_rate: float | None = Field(default=None, ge=0, le=1)
    quality_score: int = Field(default=0, ge=0, le=100)
    admin_score: int | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def no_sensitive_content(self) -> ChampionCardInput:
        import re

        body = " ".join(
            [self.title, self.customer_example, self.salesperson_reply, self.strategy_summary]
        )
        if re.search(r"(?<!\d)(?:1[3-9]\d{9})(?!\d)|[^\s@]+@[^\s@]+\.[^\s@]+", body):
            raise ValueError("card content must be redacted")
        return self


class ChampionCardCreate(ChampionCardInput):
    source_id: UUID | None = None
    conversation_id: UUID | None = None


class ChampionCardUpdate(StrictModel):
    title: str | None = Field(default=None, max_length=500)
    card_type: ChampionCardType | None = None
    applicable_industries: list[str] | None = None
    applicable_sales_stages: list[str] | None = None
    applicable_customer_sentiments: list[str] | None = None
    trigger_patterns: list[str] | None = None
    customer_intent: str | None = None
    customer_objection: str | None = None
    customer_example: str | None = None
    salesperson_reply: str | None = None
    strategy_summary: str | None = None
    why_it_works: str | None = None
    recommended_next_action: str | None = None
    suggested_question: str | None = None
    tone_tags: list[str] | None = None
    risk_notes: list[str] | None = None
    outcome: ChampionCardOutcome | None = None
    historical_success_rate: float | None = Field(default=None, ge=0, le=1)
    quality_score: int | None = Field(default=None, ge=0, le=100)
    admin_score: int | None = Field(default=None, ge=0, le=100)


class ChampionCardOut(ChampionCardInput):
    id: UUID
    tenant_id: UUID
    source_id: UUID | None
    conversation_id: UUID | None
    status: ChampionCardStatus
    version: int
    possible_duplicate: bool
    duplicate_of_card_id: UUID | None
    duplicate_score: float | None
    reviewed_by_user_id: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    searchable_text: str
    usage_count: int = 0
    adopted_count: int = 0


class ChampionSearchRequest(StrictModel):
    query: str = Field(min_length=1, max_length=5000)
    customer_id: UUID | None = None
    conversation_id: UUID | None = None
    industry: str | None = None
    sales_stage: str | None = None
    customer_sentiment: str | None = None
    top_k: int = Field(default=4, ge=1, le=10)
    min_score: float = Field(default=0.35, ge=0, le=1)


class ChampionSearchResult(ChampionCardOut):
    strategy_key: str
    semantic_score: float
    industry_score: float
    stage_score: float
    success_score: float
    admin_score_value: float
    final_score: float


class ChampionFeedbackRequest(StrictModel):
    rating: ChampionFeedbackRating
    adopted: bool = False
    feedback_text: str | None = Field(default=None, max_length=2000)
    generation_id: UUID | None = None


class ChampionBulkCardRequest(StrictModel):
    card_ids: list[UUID] = Field(min_length=1, max_length=100)


class ChampionStats(StrictModel):
    source_count: int
    conversation_count: int
    candidate_card_count: int
    review_count: int
    approved_count: int
    monthly_usage_count: int
    adoption_rate: float


class ChampionConfigUpdate(StrictModel):
    champion_enabled: bool | None = None
    champion_top_k: int | None = Field(default=None, ge=1, le=10)
    champion_min_score: float | None = Field(default=None, ge=0, le=1)
    champion_industry_weight: float | None = Field(default=None, ge=0, le=1)
    champion_stage_weight: float | None = Field(default=None, ge=0, le=1)
    champion_success_weight: float | None = Field(default=None, ge=0, le=1)
    champion_admin_score_weight: float | None = Field(default=None, ge=0, le=1)
    champion_semantic_weight: float | None = Field(default=None, ge=0, le=1)
    champion_prefer_tenant: bool | None = None
    champion_allow_general_generation: bool | None = None

    @model_validator(mode="after")
    def weights_sum(self) -> ChampionConfigUpdate:
        fields = (
            self.champion_semantic_weight,
            self.champion_industry_weight,
            self.champion_stage_weight,
            self.champion_success_weight,
            self.champion_admin_score_weight,
        )
        if all(value is not None for value in fields) and abs(sum(fields) - 1) > 0.02:
            raise ValueError("champion retrieval weights must sum to approximately 1")
        return self
