"""Add champion knowledge import, review and retrieval schema.

Revision ID: 20260717_0004
Revises: 20260717_0003
Create Date: 2026-07-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "20260717_0004"
down_revision: str | None = "20260717_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "champion_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("file_extension", sa.String(16)),
        sa.Column("mime_type", sa.String(160)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("storage_key", sa.String(500), unique=True),
        sa.Column("sha256", sa.String(64)),
        sa.Column("retain_original", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("status", sa.String(32), server_default="uploaded", nullable=False),
        sa.Column("processing_stage", sa.String(32), server_default="waiting", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("record_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("conversation_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("candidate_card_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("approved_card_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("redaction_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column("mapping_json", sa.JSON()),
        sa.Column("role_mapping_json", sa.JSON()),
        sa.Column("redaction_rules_json", sa.JSON()),
        sa.Column("preview_json", sa.JSON()),
        sa.Column("uploaded_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_champion_sources_tenant_id", "champion_sources", ["tenant_id"])
    op.create_index("ix_champion_sources_status", "champion_sources", ["status"])
    op.create_index(
        "ix_champion_sources_tenant_sha256", "champion_sources", ["tenant_id", "sha256"]
    )
    op.create_index(
        "ix_champion_sources_uploaded_by_user_id", "champion_sources", ["uploaded_by_user_id"]
    )
    op.create_index("ix_champion_sources_created_at", "champion_sources", ["created_at"])

    op.create_table(
        "champion_import_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("celery_task_id", sa.String(255)),
        sa.Column("status", sa.String(32), server_default="queued", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text()),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["champion_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("tenant_id", "source_id", "celery_task_id", "status", "created_at"):
        op.create_index(f"ix_champion_import_jobs_{column}", "champion_import_jobs", [column])

    op.create_table(
        "champion_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("external_conversation_key", sa.String(255)),
        sa.Column("title", sa.String(500)),
        sa.Column("salesperson_alias", sa.String(120), server_default="[销售姓名]", nullable=False),
        sa.Column("customer_alias", sa.String(120), server_default="[客户姓名]", nullable=False),
        sa.Column("industry", sa.String(160)),
        sa.Column("outcome", sa.String(32), server_default="unknown", nullable=False),
        sa.Column("deal_amount", sa.Float()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("message_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("redaction_status", sa.String(32), server_default="completed", nullable=False),
        sa.Column("metadata_json", sa.JSON()),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["champion_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "source_id",
            "external_conversation_key",
            name="uq_champion_conversation_external_key",
        ),
    )
    for column in ("tenant_id", "source_id", "created_at"):
        op.create_index(f"ix_champion_conversations_{column}", "champion_conversations", [column])

    op.create_table(
        "champion_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("message_index", sa.Integer(), nullable=False),
        sa.Column("sender_role", sa.String(32), nullable=False),
        sa.Column("sender_alias", sa.String(120)),
        sa.Column("content_redacted", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True)),
        sa.Column("redaction_flags", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["champion_conversations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "conversation_id",
            "message_index",
            name="uq_champion_message_conversation_index",
        ),
    )
    for column in ("tenant_id", "conversation_id", "created_at"):
        op.create_index(f"ix_champion_messages_{column}", "champion_messages", [column])

    op.create_table(
        "champion_cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid()),
        sa.Column("conversation_id", sa.Uuid()),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("card_type", sa.String(32), nullable=False),
        sa.Column("applicable_industries", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("applicable_sales_stages", sa.JSON(), server_default="[]", nullable=False),
        sa.Column(
            "applicable_customer_sentiments", sa.JSON(), server_default="[]", nullable=False
        ),
        sa.Column("trigger_patterns", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("customer_intent", sa.Text()),
        sa.Column("customer_objection", sa.Text()),
        sa.Column("customer_example", sa.Text(), nullable=False),
        sa.Column("salesperson_reply", sa.Text(), nullable=False),
        sa.Column("strategy_summary", sa.Text(), nullable=False),
        sa.Column("why_it_works", sa.Text(), nullable=False),
        sa.Column("recommended_next_action", sa.Text()),
        sa.Column("suggested_question", sa.Text()),
        sa.Column("tone_tags", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("risk_notes", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("outcome", sa.String(32), server_default="unknown", nullable=False),
        sa.Column("historical_success_rate", sa.Float()),
        sa.Column("quality_score", sa.Integer(), server_default="0", nullable=False),
        sa.Column("admin_score", sa.Integer()),
        sa.Column("searchable_text", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("embedding", Vector(1536)),
        sa.Column("status", sa.String(32), server_default="review", nullable=False),
        sa.Column("possible_duplicate", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("duplicate_of_card_id", sa.Uuid()),
        sa.Column("duplicate_score", sa.Float()),
        sa.Column("reviewed_by_user_id", sa.Uuid()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["champion_sources.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["champion_conversations.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["duplicate_of_card_id"], ["champion_cards.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "tenant_id",
        "source_id",
        "conversation_id",
        "card_type",
        "status",
        "duplicate_of_card_id",
        "reviewed_by_user_id",
        "created_by_user_id",
        "created_at",
    ):
        op.create_index(f"ix_champion_cards_{column}", "champion_cards", [column])
    op.create_index(
        "ix_champion_cards_tenant_content_hash", "champion_cards", ["tenant_id", "content_hash"]
    )
    op.create_index(
        "ix_champion_cards_embedding_hnsw",
        "champion_cards",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    op.create_table(
        "champion_card_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("changed_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("change_reason", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["card_id"], ["champion_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "card_id", "version", name="uq_champion_card_version"),
    )
    for column in ("tenant_id", "card_id", "created_at"):
        op.create_index(f"ix_champion_card_versions_{column}", "champion_card_versions", [column])

    op.create_table(
        "champion_card_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("card_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("generation_id", sa.Uuid()),
        sa.Column("rating", sa.String(32), nullable=False),
        sa.Column("adopted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("feedback_text", sa.Text()),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["card_id"], ["champion_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["generation_id"], ["generation_records.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "card_id",
            "user_id",
            "generation_id",
            name="uq_champion_card_feedback",
        ),
    )
    for column in ("tenant_id", "card_id", "user_id", "generation_id", "created_at"):
        op.create_index(f"ix_champion_card_feedback_{column}", "champion_card_feedback", [column])
    op.create_index(
        "uq_champion_card_feedback_without_generation",
        "champion_card_feedback",
        ["tenant_id", "card_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("generation_id IS NULL"),
    )

    op.create_table(
        "champion_retrieval_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid()),
        sa.Column("conversation_id", sa.Uuid()),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column("top_score", sa.Float()),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("filters_json", sa.JSON()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["conversations.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("tenant_id", "user_id", "customer_id", "conversation_id", "created_at"):
        op.create_index(f"ix_champion_retrieval_logs_{column}", "champion_retrieval_logs", [column])

    op.create_table(
        "generation_champion_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("generation_id", sa.Uuid(), nullable=False),
        sa.Column("champion_card_id", sa.Uuid()),
        sa.Column("strategy_key", sa.String(8), nullable=False),
        sa.Column("title_snapshot", sa.String(500), nullable=False),
        sa.Column("card_type", sa.String(40), nullable=False),
        sa.Column("strategy_snapshot", sa.Text(), nullable=False),
        sa.Column("reply_snapshot", sa.Text(), nullable=False),
        sa.Column("retrieval_score", sa.Float(), nullable=False),
        sa.Column("used_in_strategy", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["generation_id"], ["generation_records.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["champion_card_id"], ["champion_cards.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "generation_id", "strategy_key", name="uq_generation_champion_strategy"
        ),
    )
    for column in ("tenant_id", "generation_id", "champion_card_id", "created_at"):
        op.create_index(
            f"ix_generation_champion_sources_{column}", "generation_champion_sources", [column]
        )

    additions = [
        ("champion_enabled", sa.Boolean(), sa.true()),
        ("champion_top_k", sa.Integer(), sa.text("4")),
        ("champion_min_score", sa.Float(), sa.text("0.35")),
        ("champion_industry_weight", sa.Float(), sa.text("0.15")),
        ("champion_stage_weight", sa.Float(), sa.text("0.15")),
        ("champion_success_weight", sa.Float(), sa.text("0.10")),
        ("champion_admin_score_weight", sa.Float(), sa.text("0.10")),
        ("champion_semantic_weight", sa.Float(), sa.text("0.50")),
        ("champion_prefer_tenant", sa.Boolean(), sa.true()),
        ("champion_allow_general_generation", sa.Boolean(), sa.true()),
    ]
    for name, column_type, default in additions:
        op.add_column(
            "agent_configs",
            sa.Column(name, column_type, server_default=default, nullable=False),
        )


def downgrade() -> None:
    for column in (
        "champion_allow_general_generation",
        "champion_prefer_tenant",
        "champion_semantic_weight",
        "champion_admin_score_weight",
        "champion_success_weight",
        "champion_stage_weight",
        "champion_industry_weight",
        "champion_min_score",
        "champion_top_k",
        "champion_enabled",
    ):
        op.drop_column("agent_configs", column)
    op.drop_table("generation_champion_sources")
    op.drop_table("champion_retrieval_logs")
    op.drop_table("champion_card_feedback")
    op.drop_table("champion_card_versions")
    op.drop_table("champion_cards")
    op.drop_table("champion_messages")
    op.drop_table("champion_conversations")
    op.drop_table("champion_import_jobs")
    op.drop_table("champion_sources")
