from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.conversation import Conversation, Message
    from app.models.customer import Customer, CustomerContact
    from app.models.user import User


class TenantStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(
            TenantStatus,
            name="tenant_status",
            native_enum=False,
            length=16,
            validate_strings=True,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=TenantStatus.ACTIVE,
        nullable=False,
    )

    users: Mapped[list[User]] = relationship(back_populates="tenant")
    customers: Mapped[list[Customer]] = relationship(back_populates="tenant")
    contacts: Mapped[list[CustomerContact]] = relationship(back_populates="tenant")
    conversations: Mapped[list[Conversation]] = relationship(back_populates="tenant")
    messages: Mapped[list[Message]] = relationship(back_populates="tenant")
