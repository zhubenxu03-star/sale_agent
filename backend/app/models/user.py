from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant


class UserRole(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    SALES = "sales"


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_id_email"),)

    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="user_role",
            native_enum=False,
            length=16,
            validate_strings=True,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=UserRole.SALES,
        nullable=False,
    )
    status: Mapped[UserStatus] = mapped_column(
        SAEnum(
            UserStatus,
            name="user_status",
            native_enum=False,
            length=16,
            validate_strings=True,
            values_callable=lambda enum: [member.value for member in enum],
        ),
        default=UserStatus.ACTIVE,
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship(back_populates="users")
