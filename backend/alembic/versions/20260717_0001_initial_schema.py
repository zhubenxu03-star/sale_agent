"""Create initial multi-tenant sales schema.

Revision ID: 20260717_0001
Revises:
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260717_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamp_columns(include_updated_at: bool = True) -> list[sa.Column]:
    columns = [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        )
    ]
    if include_updated_at:
        columns.append(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            )
        )
    return columns


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="tenant_status_values"),
        sa.PrimaryKeyConstraint("id", name="pk_tenants"),
        sa.UniqueConstraint("code", name="uq_tenants_code"),
    )
    op.create_index("ix_tenants_created_at", "tenants", ["created_at"])

    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=500), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("role IN ('admin', 'manager', 'sales')", name="user_role_values"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="user_status_values"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_users_tenant"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_id_email"),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_users_created_at", "users", ["created_at"])

    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("company_name", sa.String(length=240), nullable=True),
        sa.Column("industry", sa.String(length=120), nullable=True),
        sa.Column("company_size", sa.String(length=80), nullable=True),
        sa.Column("region", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=120), nullable=True),
        sa.Column("stage", sa.String(length=80), nullable=True),
        sa.Column("budget_min", sa.Numeric(14, 2), nullable=True),
        sa.Column("budget_max", sa.Numeric(14, 2), nullable=True),
        sa.Column("expected_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("expected_close_date", sa.Date(), nullable=True),
        sa.Column("deal_probability", sa.Numeric(5, 2), nullable=True),
        sa.Column("core_needs", sa.JSON(), nullable=True),
        sa.Column("pain_points", sa.JSON(), nullable=True),
        sa.Column("objections", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_customers_owner_user",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_customers_tenant",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customers"),
    )
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])
    op.create_index("ix_customers_owner_user_id", "customers", ["owner_user_id"])
    op.create_index("ix_customers_stage", "customers", ["stage"])
    op.create_index("ix_customers_created_at", "customers", ["created_at"])

    op.create_table(
        "customer_contacts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("position", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("is_decision_maker", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name="fk_customer_contacts_customer",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_customer_contacts_tenant",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customer_contacts"),
    )
    op.create_index("ix_customer_contacts_tenant_id", "customer_contacts", ["tenant_id"])
    op.create_index("ix_customer_contacts_customer_id", "customer_contacts", ["customer_id"])
    op.create_index("ix_customer_contacts_created_at", "customer_contacts", ["created_at"])

    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        *timestamp_columns(),
        sa.CheckConstraint("status IN ('active', 'archived')", name="conversation_status_values"),
        sa.ForeignKeyConstraint(
            ["customer_id"],
            ["customers.id"],
            ondelete="CASCADE",
            name="fk_conversations_customer",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_conversations_owner_user",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_conversations_tenant",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_conversations"),
    )
    op.create_index("ix_conversations_tenant_id", "conversations", ["tenant_id"])
    op.create_index("ix_conversations_customer_id", "conversations", ["customer_id"])
    op.create_index("ix_conversations_owner_user_id", "conversations", ["owner_user_id"])
    op.create_index("ix_conversations_created_at", "conversations", ["created_at"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_type", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        *timestamp_columns(include_updated_at=False),
        sa.CheckConstraint(
            "sender_type IN ('customer', 'sales', 'assistant', 'system')",
            name="message_sender_type_values",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
            name="fk_messages_conversation",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
            name="fk_messages_tenant",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_messages"),
    )
    op.create_index("ix_messages_tenant_id", "messages", ["tenant_id"])
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("customer_contacts")
    op.drop_table("customers")
    op.drop_table("users")
    op.drop_table("tenants")
