from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.champion import GenerationChampionSource


def enum_column(enum: type[StrEnum], name: str) -> SAEnum:
    return SAEnum(
        enum,
        name=name,
        native_enum=False,
        length=32,
        validate_strings=True,
        values_callable=lambda values: [item.value for item in values],
    )


class AgentStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class ReplyStyle(StrEnum):
    CONSULTATIVE = "consultative"
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    CONCISE = "concise"
    CONVERSION = "conversion"


class ReplyLength(StrEnum):
    SHORT = "short"
    MEDIUM = "medium"
    LONG = "long"


class SalesAggressiveness(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class GenerationStatus(StrEnum):
    QUEUED = "queued"
    RETRIEVING = "retrieving"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FeedbackRating(StrEnum):
    HELPFUL = "helpful"
    NOT_HELPFUL = "not_helpful"


class Agent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agents"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_agents_tenant_name"),)
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[AgentStatus] = mapped_column(
        enum_column(AgentStatus, "agent_status"), default=AgentStatus.ACTIVE
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    config: Mapped[AgentConfig] = relationship(
        back_populates="agent", cascade="all, delete-orphan", uselist=False
    )


class AgentConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "agent_configs"
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), unique=True)
    identity_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reply_style: Mapped[ReplyStyle] = mapped_column(
        enum_column(ReplyStyle, "agent_reply_style"), default=ReplyStyle.CONSULTATIVE
    )
    reply_length: Mapped[ReplyLength] = mapped_column(
        enum_column(ReplyLength, "agent_reply_length"), default=ReplyLength.MEDIUM
    )
    sales_aggressiveness: Mapped[SalesAggressiveness] = mapped_column(
        enum_column(SalesAggressiveness, "agent_sales_aggressiveness"),
        default=SalesAggressiveness.MEDIUM,
    )
    allow_emoji: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_top_k: Mapped[int] = mapped_column(Integer, default=6, nullable=False)
    default_min_score: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.3, nullable=False)
    max_output_tokens: Mapped[int] = mapped_column(Integer, default=1500, nullable=False)
    require_citations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    prohibited_claims: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    human_handoff_rules: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    custom_instructions: Mapped[str | None] = mapped_column(Text)
    champion_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    champion_top_k: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    champion_min_score: Mapped[float] = mapped_column(Float, default=0.35, nullable=False)
    champion_industry_weight: Mapped[float] = mapped_column(Float, default=0.15, nullable=False)
    champion_stage_weight: Mapped[float] = mapped_column(Float, default=0.15, nullable=False)
    champion_success_weight: Mapped[float] = mapped_column(Float, default=0.10, nullable=False)
    champion_admin_score_weight: Mapped[float] = mapped_column(
        Float, default=0.10, nullable=False
    )
    champion_semantic_weight: Mapped[float] = mapped_column(Float, default=0.50, nullable=False)
    champion_prefer_tenant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    champion_allow_general_generation: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    agent: Mapped[Agent] = relationship(back_populates="config")


class GenerationRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "generation_records"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_generation_tenant_request"),
        Index("ix_generation_records_tenant_created", "tenant_id", "created_at"),
    )
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[UUID] = mapped_column(ForeignKey("agents.id", ondelete="RESTRICT"), index=True)
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True
    )
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    source_message_id: Mapped[UUID | None] = mapped_column(
        ForeignKey(
            "messages.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_generation_records_source_message_id_messages",
        ),
        index=True,
    )
    request_id: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[GenerationStatus] = mapped_column(
        enum_column(GenerationStatus, "generation_status"),
        default=GenerationStatus.QUEUED,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(80))
    model_name: Mapped[str] = mapped_column(String(160))
    embedding_mode: Mapped[str] = mapped_column(String(32))
    prompt_version: Mapped[str] = mapped_column(String(40))
    config_version: Mapped[int] = mapped_column(Integer)
    customer_message: Mapped[str] = mapped_column(Text)
    result_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    reply_text: Mapped[str | None] = mapped_column(Text)
    need_human: Mapped[bool] = mapped_column(Boolean, default=False)
    human_reason: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sources: Mapped[list[GenerationSource]] = relationship(
        back_populates="generation", cascade="all, delete-orphan"
    )
    feedback: Mapped[list[GenerationFeedback]] = relationship(
        back_populates="generation", cascade="all, delete-orphan"
    )
    champion_sources: Mapped[list[GenerationChampionSource]] = relationship(
        back_populates="generation", cascade="all, delete-orphan"
    )


class GenerationSource(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "generation_sources"
    __table_args__ = (
        UniqueConstraint("generation_id", "citation_key", name="uq_generation_source_key"),
    )
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    generation_id: Mapped[UUID] = mapped_column(
        ForeignKey("generation_records.id", ondelete="CASCADE"), index=True
    )
    knowledge_chunk_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("knowledge_chunks.id", ondelete="SET NULL"), index=True
    )
    document_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("knowledge_documents.id", ondelete="SET NULL"), index=True
    )
    citation_key: Mapped[str] = mapped_column(String(20))
    citation_label: Mapped[str] = mapped_column(String(600))
    content_snapshot: Mapped[str] = mapped_column(Text)
    retrieval_score: Mapped[float] = mapped_column(Float)
    used_in_reply: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    generation: Mapped[GenerationRecord] = relationship(back_populates="sources")


class GenerationFeedback(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "generation_feedback"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "generation_id", "user_id", name="uq_generation_feedback_user"
        ),
    )
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    generation_id: Mapped[UUID] = mapped_column(
        ForeignKey("generation_records.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[FeedbackRating] = mapped_column(
        enum_column(FeedbackRating, "generation_feedback_rating")
    )
    adopted: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_before_save: Mapped[bool] = mapped_column(Boolean, default=False)
    feedback_text: Mapped[str | None] = mapped_column(Text)
    generation: Mapped[GenerationRecord] = relationship(back_populates="feedback")
