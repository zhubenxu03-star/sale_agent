from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.tenant import Tenant


class ConversationStatus(StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class SenderType(StrEnum):
    CUSTOMER = "customer"
    SALES = "sales"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[ConversationStatus] = mapped_column(
        SAEnum(
            ConversationStatus,
            name="conversation_status",
            native_enum=False,
            length=16,
            validate_strings=True,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=ConversationStatus.ACTIVE,
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship(back_populates="conversations")
    customer: Mapped[Customer] = relationship(back_populates="conversations")
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "messages"

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_type: Mapped[SenderType] = mapped_column(
        SAEnum(
            SenderType,
            name="sender_type",
            native_enum=False,
            length=16,
            validate_strings=True,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    generation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("generation_records.id", ondelete="SET NULL"),
        unique=True,
        index=True,
    )
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_user_edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        index=True,
    )

    tenant: Mapped[Tenant] = relationship(back_populates="messages")
    conversation: Mapped[Conversation] = relationship(back_populates="messages")
