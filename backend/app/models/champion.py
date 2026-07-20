from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    BigInteger,
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
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.agent import GenerationRecord


def enum_column(enum: type[StrEnum], name: str, length: int = 32) -> SAEnum:
    return SAEnum(
        enum,
        name=name,
        native_enum=False,
        length=length,
        validate_strings=True,
        values_callable=lambda values: [item.value for item in values],
    )


class ChampionSourceType(StrEnum):
    CHAT_EXPORT = "chat_export"
    SCRIPT_DOCUMENT = "script_document"
    SALES_TRAINING = "sales_training"
    MANUAL = "manual"


class ChampionSourceStatus(StrEnum):
    UPLOADED = "uploaded"
    MAPPING_REQUIRED = "mapping_required"
    PROCESSING = "processing"
    REVIEW_REQUIRED = "review_required"
    READY = "ready"
    FAILED = "failed"
    DISABLED = "disabled"


class ChampionProcessingStage(StrEnum):
    WAITING = "waiting"
    PARSING = "parsing"
    ROLE_MAPPING = "role_mapping"
    REDACTING = "redacting"
    SEGMENTING = "segmenting"
    EXTRACTING = "extracting"
    DEDUPLICATING = "deduplicating"
    SAVING = "saving"
    COMPLETED = "completed"
    FAILED = "failed"


class ChampionJobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class ChampionConversationOutcome(StrEnum):
    WON = "won"
    LOST = "lost"
    ONGOING = "ongoing"
    UNKNOWN = "unknown"


class ChampionSenderRole(StrEnum):
    CUSTOMER = "customer"
    SALESPERSON = "salesperson"
    SYSTEM = "system"
    UNKNOWN = "unknown"


class ChampionCardType(StrEnum):
    OPENING = "opening"
    NEEDS_DISCOVERY = "needs_discovery"
    VALUE_PROPOSITION = "value_proposition"
    OBJECTION_HANDLING = "objection_handling"
    PRICING = "pricing"
    COMPETITOR = "competitor"
    FOLLOW_UP = "follow_up"
    APPOINTMENT = "appointment"
    NEGOTIATION = "negotiation"
    CLOSING = "closing"
    REACTIVATION = "reactivation"
    AFTER_SALES = "after_sales"
    GENERAL = "general"


class ChampionCardOutcome(StrEnum):
    WON = "won"
    EFFECTIVE = "effective"
    NEUTRAL = "neutral"
    INEFFECTIVE = "ineffective"
    UNKNOWN = "unknown"


class ChampionCardStatus(StrEnum):
    DRAFT = "draft"
    REVIEW = "review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISABLED = "disabled"


class ChampionFeedbackRating(StrEnum):
    HELPFUL = "helpful"
    NOT_HELPFUL = "not_helpful"


class ChampionSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "champion_sources"
    __table_args__ = (
        Index("ix_champion_sources_tenant_sha256", "tenant_id", "sha256"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[ChampionSourceType] = mapped_column(
        enum_column(ChampionSourceType, "champion_source_type"), nullable=False
    )
    original_filename: Mapped[str | None] = mapped_column(String(255))
    file_extension: Mapped[str | None] = mapped_column(String(16))
    mime_type: Mapped[str | None] = mapped_column(String(160))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    storage_key: Mapped[str | None] = mapped_column(String(500), unique=True)
    sha256: Mapped[str | None] = mapped_column(String(64))
    retain_original: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[ChampionSourceStatus] = mapped_column(
        enum_column(ChampionSourceStatus, "champion_source_status"),
        default=ChampionSourceStatus.UPLOADED,
        nullable=False,
        index=True,
    )
    processing_stage: Mapped[ChampionProcessingStage] = mapped_column(
        enum_column(ChampionProcessingStage, "champion_processing_stage"),
        default=ChampionProcessingStage.WAITING,
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    conversation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    candidate_card_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    approved_card_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    redaction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(100))
    error_message: Mapped[str | None] = mapped_column(Text)
    mapping_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    role_mapping_json: Mapped[dict[str, str] | None] = mapped_column(JSON)
    redaction_rules_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    preview_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    uploaded_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversations: Mapped[list[ChampionConversation]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    cards: Mapped[list[ChampionCard]] = relationship(back_populates="source")
    jobs: Mapped[list[ChampionImportJob]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class ChampionImportJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "champion_import_jobs"

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[UUID] = mapped_column(
        ForeignKey("champion_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    celery_task_id: Mapped[str | None] = mapped_column(String(255), index=True)
    status: Mapped[ChampionJobStatus] = mapped_column(
        enum_column(ChampionJobStatus, "champion_job_status"),
        default=ChampionJobStatus.QUEUED,
        nullable=False,
        index=True,
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)

    source: Mapped[ChampionSource] = relationship(back_populates="jobs")


class ChampionConversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "champion_conversations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "source_id",
            "external_conversation_key",
            name="uq_champion_conversation_external_key",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[UUID] = mapped_column(
        ForeignKey("champion_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_conversation_key: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(500))
    salesperson_alias: Mapped[str] = mapped_column(String(120), default="[销售姓名]", nullable=False)
    customer_alias: Mapped[str] = mapped_column(String(120), default="[客户姓名]", nullable=False)
    industry: Mapped[str | None] = mapped_column(String(160))
    outcome: Mapped[ChampionConversationOutcome] = mapped_column(
        enum_column(ChampionConversationOutcome, "champion_conversation_outcome"),
        default=ChampionConversationOutcome.UNKNOWN,
        nullable=False,
    )
    deal_amount: Mapped[float | None] = mapped_column(Float)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    redaction_status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    source: Mapped[ChampionSource] = relationship(back_populates="conversations")
    messages: Mapped[list[ChampionMessage]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    cards: Mapped[list[ChampionCard]] = relationship(back_populates="conversation")


class ChampionMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "champion_messages"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "conversation_id",
            "message_index",
            name="uq_champion_message_conversation_index",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("champion_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message_index: Mapped[int] = mapped_column(Integer, nullable=False)
    sender_role: Mapped[ChampionSenderRole] = mapped_column(
        enum_column(ChampionSenderRole, "champion_sender_role"), nullable=False
    )
    sender_alias: Mapped[str | None] = mapped_column(String(120))
    content_redacted: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    redaction_flags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    conversation: Mapped[ChampionConversation] = relationship(back_populates="messages")


class ChampionCard(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "champion_cards"
    __table_args__ = (
        Index(
            "ix_champion_cards_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index("ix_champion_cards_tenant_content_hash", "tenant_id", "content_hash"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("champion_sources.id", ondelete="SET NULL"), index=True
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("champion_conversations.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    card_type: Mapped[ChampionCardType] = mapped_column(
        enum_column(ChampionCardType, "champion_card_type"), nullable=False, index=True
    )
    applicable_industries: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    applicable_sales_stages: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    applicable_customer_sentiments: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    trigger_patterns: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    customer_intent: Mapped[str | None] = mapped_column(Text)
    customer_objection: Mapped[str | None] = mapped_column(Text)
    customer_example: Mapped[str] = mapped_column(Text, nullable=False)
    salesperson_reply: Mapped[str] = mapped_column(Text, nullable=False)
    strategy_summary: Mapped[str] = mapped_column(Text, nullable=False)
    why_it_works: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_next_action: Mapped[str | None] = mapped_column(Text)
    suggested_question: Mapped[str | None] = mapped_column(Text)
    tone_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    risk_notes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    outcome: Mapped[ChampionCardOutcome] = mapped_column(
        enum_column(ChampionCardOutcome, "champion_card_outcome"),
        default=ChampionCardOutcome.UNKNOWN,
        nullable=False,
    )
    historical_success_rate: Mapped[float | None] = mapped_column(Float)
    quality_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    admin_score: Mapped[int | None] = mapped_column(Integer)
    searchable_text: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    status: Mapped[ChampionCardStatus] = mapped_column(
        enum_column(ChampionCardStatus, "champion_card_status"),
        default=ChampionCardStatus.REVIEW,
        nullable=False,
        index=True,
    )
    possible_duplicate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    duplicate_of_card_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("champion_cards.id", ondelete="SET NULL"), index=True
    )
    duplicate_score: Mapped[float | None] = mapped_column(Float)
    reviewed_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    source: Mapped[ChampionSource | None] = relationship(back_populates="cards")
    conversation: Mapped[ChampionConversation | None] = relationship(back_populates="cards")
    versions: Mapped[list[ChampionCardVersion]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )
    feedback: Mapped[list[ChampionCardFeedback]] = relationship(
        back_populates="card", cascade="all, delete-orphan"
    )


class ChampionCardVersion(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "champion_card_versions"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "card_id", "version", name="uq_champion_card_version"
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_id: Mapped[UUID] = mapped_column(
        ForeignKey("champion_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    changed_by_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    change_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    card: Mapped[ChampionCard] = relationship(back_populates="versions")


class ChampionCardFeedback(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "champion_card_feedback"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "card_id",
            "user_id",
            "generation_id",
            name="uq_champion_card_feedback",
        ),
        Index(
            "uq_champion_card_feedback_without_generation",
            "tenant_id",
            "card_id",
            "user_id",
            unique=True,
            postgresql_where=text("generation_id IS NULL"),
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_id: Mapped[UUID] = mapped_column(
        ForeignKey("champion_cards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generation_records.id", ondelete="SET NULL"), index=True
    )
    rating: Mapped[ChampionFeedbackRating] = mapped_column(
        enum_column(ChampionFeedbackRating, "champion_feedback_rating"), nullable=False
    )
    adopted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    feedback_text: Mapped[str | None] = mapped_column(Text)

    card: Mapped[ChampionCard] = relationship(back_populates="feedback")


class ChampionRetrievalLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "champion_retrieval_logs"

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    conversation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), index=True
    )
    query: Mapped[str] = mapped_column(Text, nullable=False)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False)
    top_score: Mapped[float | None] = mapped_column(Float)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    filters_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class GenerationChampionSource(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "generation_champion_sources"
    __table_args__ = (
        UniqueConstraint(
            "generation_id", "strategy_key", name="uq_generation_champion_strategy"
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generation_id: Mapped[UUID] = mapped_column(
        ForeignKey("generation_records.id", ondelete="CASCADE"), nullable=False, index=True
    )
    champion_card_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("champion_cards.id", ondelete="SET NULL"), index=True
    )
    strategy_key: Mapped[str] = mapped_column(String(8), nullable=False)
    title_snapshot: Mapped[str] = mapped_column(String(500), nullable=False)
    card_type: Mapped[str] = mapped_column(String(40), nullable=False)
    strategy_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    reply_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    retrieval_score: Mapped[float] = mapped_column(Float, nullable=False)
    used_in_strategy: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    generation: Mapped[GenerationRecord] = relationship(back_populates="champion_sources")
