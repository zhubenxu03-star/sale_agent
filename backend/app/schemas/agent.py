from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.agent import (
    AgentStatus,
    FeedbackRating,
    GenerationStatus,
    ReplyLength,
    ReplyStyle,
    SalesAggressiveness,
)


class SalesStage(StrEnum):
    INITIAL_CONTACT = "initial_contact"
    NEEDS_DISCOVERY = "needs_discovery"
    SOLUTION = "solution"
    QUOTATION = "quotation"
    NEGOTIATION = "negotiation"
    CLOSING = "closing"
    AFTER_SALES = "after_sales"
    UNKNOWN = "unknown"


class CustomerSentiment(StrEnum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    HESITANT = "hesitant"
    NEGATIVE = "negative"
    URGENT = "urgent"


class RiskFlag(StrEnum):
    PRICE_UNVERIFIED = "PRICE_UNVERIFIED"
    DISCOUNT_APPROVAL_REQUIRED = "DISCOUNT_APPROVAL_REQUIRED"
    DELIVERY_COMMITMENT = "DELIVERY_COMMITMENT"
    LEGAL_OR_CONTRACT = "LEGAL_OR_CONTRACT"
    REFUND_OR_COMPLAINT = "REFUND_OR_COMPLAINT"
    SECURITY_COMMITMENT = "SECURITY_COMMITMENT"
    NO_RELIABLE_KNOWLEDGE = "NO_RELIABLE_KNOWLEDGE"
    CUSTOMER_REQUESTED_HUMAN = "CUSTOMER_REQUESTED_HUMAN"
    HIGH_VALUE_OPPORTUNITY = "HIGH_VALUE_OPPORTUNITY"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID"
    PROMPT_INJECTION_DETECTED = "PROMPT_INJECTION_DETECTED"


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    citation_key: str = Field(pattern=r"^K[1-9][0-9]*$")
    claim: str = Field(min_length=1, max_length=1000)


class ChampionMethodUsed(BaseModel):
    model_config = ConfigDict(extra="forbid")
    strategy_key: str = Field(pattern=r"^S[1-9][0-9]*$")
    purpose: str = Field(min_length=1, max_length=500)


class AgentOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply_text: str = Field(min_length=1, max_length=12000)
    customer_intent: str = Field(min_length=1, max_length=1000)
    sales_stage: SalesStage
    customer_sentiment: CustomerSentiment
    core_needs: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(max_length=20)
    objections: list[Annotated[str, Field(min_length=1, max_length=500)]] = Field(max_length=20)
    recommended_strategy: str = Field(min_length=1, max_length=3000)
    next_action: str = Field(min_length=1, max_length=2000)
    suggested_question: str | None = Field(default=None, max_length=1000)
    need_human: bool
    human_reason: str | None = Field(default=None, max_length=2000)
    risk_flags: list[RiskFlag] = Field(max_length=20)
    confidence: float = Field(ge=0, le=1)
    citations: list[Citation] = Field(max_length=20)
    champion_methods_used: list[ChampionMethodUsed] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def validate_handoff(self) -> "AgentOutput":
        if self.need_human and not self.human_reason:
            raise ValueError("need_human 为 true 时必须提供 human_reason")
        if not self.need_human and self.human_reason:
            raise ValueError("need_human 为 false 时 human_reason 必须为空")
        return self


class AgentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    status: AgentStatus
    is_default: bool
    created_at: datetime
    updated_at: datetime


class AgentConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    agent_id: UUID
    identity_prompt: str
    reply_style: ReplyStyle
    reply_length: ReplyLength
    sales_aggressiveness: SalesAggressiveness
    allow_emoji: bool
    default_top_k: int
    default_min_score: float
    temperature: float
    max_output_tokens: int
    require_citations: bool
    prohibited_claims: list[str]
    human_handoff_rules: list[str]
    custom_instructions: str | None
    version: int
    champion_enabled: bool = True
    champion_top_k: int = 4
    champion_min_score: float = 0.35
    champion_industry_weight: float = 0.15
    champion_stage_weight: float = 0.15
    champion_success_weight: float = 0.10
    champion_admin_score_weight: float = 0.10
    champion_semantic_weight: float = 0.50
    champion_prefer_tenant: bool = True
    champion_allow_general_generation: bool = True
    updated_at: datetime


class AgentConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity_prompt: str | None = Field(default=None, min_length=10, max_length=4000)
    reply_style: ReplyStyle | None = None
    reply_length: ReplyLength | None = None
    sales_aggressiveness: SalesAggressiveness | None = None
    allow_emoji: bool | None = None
    default_top_k: int | None = Field(default=None, ge=1, le=20)
    default_min_score: float | None = Field(default=None, ge=0, le=1)
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_output_tokens: int | None = Field(default=None, ge=128, le=8000)
    require_citations: bool | None = None
    prohibited_claims: list[str] | None = Field(default=None, max_length=50)
    human_handoff_rules: list[str] | None = Field(default=None, max_length=50)
    custom_instructions: str | None = Field(default=None, max_length=4000)
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
    def validate_champion_weights(self) -> "AgentConfigUpdate":
        weights = (
            self.champion_semantic_weight,
            self.champion_industry_weight,
            self.champion_stage_weight,
            self.champion_success_weight,
            self.champion_admin_score_weight,
        )
        if all(item is not None for item in weights) and abs(sum(weights) - 1) > 0.02:
            raise ValueError("销冠检索权重总和必须接近1")
        return self


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    agent_id: UUID
    customer_id: UUID
    conversation_id: UUID
    source_message_id: UUID
    mode: Literal["standard", "shorter", "colloquial", "conversion"] = "standard"


class GenerationSourceOut(BaseModel):
    citation_key: str
    citation_label: str
    content_snapshot: str
    retrieval_score: float
    used_in_reply: bool
    document_available: bool


class GenerationChampionSourceOut(BaseModel):
    strategy_key: str
    title_snapshot: str
    card_type: str
    strategy_snapshot: str
    reply_snapshot: str
    retrieval_score: float
    used_in_strategy: bool


class GenerationOut(BaseModel):
    id: UUID
    request_id: str
    status: GenerationStatus
    agent_id: UUID
    customer_id: UUID
    conversation_id: UUID
    source_message_id: UUID | None
    provider: str
    model_name: str
    embedding_mode: str
    prompt_version: str
    config_version: int
    result: AgentOutput | None
    reply_text: str | None
    need_human: bool
    human_reason: str | None
    confidence: float | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    duration_ms: int | None
    error_code: str | None
    error_message: str | None
    sources: list[GenerationSourceOut]
    champion_sources: list[GenerationChampionSourceOut] = []
    created_at: datetime
    completed_at: datetime | None


class GenerationListOut(BaseModel):
    items: list[GenerationOut]
    total: int
    page: int
    page_size: int


class SaveGenerationMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply_text: str = Field(min_length=1, max_length=12000)
    confirmed_human_review: bool = False


class GenerationFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rating: FeedbackRating
    adopted: bool = False
    edited_before_save: bool = False
    feedback_text: str | None = Field(default=None, max_length=2000)


class AgentStatusOut(BaseModel):
    available: bool
    provider: str
    model_name: str
    test_mode: bool
    stream_enabled: bool
    knowledge_ready_documents: int


class UsageSummaryOut(BaseModel):
    today_generations: int
    month_generations: int
    today_tokens: int
    month_tokens: int
    successful: int
    failed: int
    average_duration_ms: float
