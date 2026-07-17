"""Add knowledge-grounded sales agent generation schema.

Revision ID: 20260717_0003
Revises: 20260717_0002
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260717_0003"
down_revision: str | None = "20260717_0002"
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
        "agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_agents_tenant_name"),
    )
    op.create_index("ix_agents_tenant_id", "agents", ["tenant_id"])
    op.create_index("ix_agents_created_at", "agents", ["created_at"])

    op.execute(
        """
        INSERT INTO agents
            (id, tenant_id, name, description, status, is_default, created_by_user_id)
        SELECT gen_random_uuid(), t.id, '销转智能体',
               '依据企业知识为销售提供可审计的回复建议', 'active', true,
               (SELECT u.id FROM users u WHERE u.tenant_id = t.id
                ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at LIMIT 1)
        FROM tenants t
        WHERE EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id)
        """
    )

    op.create_table(
        "agent_configs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("identity_prompt", sa.Text(), nullable=False),
        sa.Column("reply_style", sa.String(32), nullable=False, server_default="consultative"),
        sa.Column("reply_length", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("sales_aggressiveness", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("allow_emoji", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_top_k", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("default_min_score", sa.Float(), nullable=False, server_default="0.35"),
        sa.Column("temperature", sa.Float(), nullable=False, server_default="0.3"),
        sa.Column("max_output_tokens", sa.Integer(), nullable=False, server_default="1500"),
        sa.Column("require_citations", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("prohibited_claims", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("human_handoff_rules", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("custom_instructions", sa.Text()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_id"),
    )
    op.create_index("ix_agent_configs_tenant_id", "agent_configs", ["tenant_id"])
    op.create_index("ix_agent_configs_created_at", "agent_configs", ["created_at"])
    op.execute(
        """
        INSERT INTO agent_configs
            (id, tenant_id, agent_id, identity_prompt, prohibited_claims, human_handoff_rules)
        SELECT gen_random_uuid(), a.tenant_id, a.id,
               '你是企业销转智能体。请依据提供的企业知识，输出专业、克制、可核验的销售建议，不得编造事实。',
               '["未经依据不得承诺价格、折扣、交付、资质或效果"]'::json,
               '["投诉退款、合同法律、特殊折扣、安全合规或客户要求人工时转人工"]'::json
        FROM agents a
        WHERE a.is_default = true
        """
    )

    op.create_table(
        "generation_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("source_message_id", sa.Uuid()),
        sa.Column("request_id", sa.String(80), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("provider", sa.String(80), nullable=False),
        sa.Column("model_name", sa.String(160), nullable=False),
        sa.Column("embedding_mode", sa.String(32), nullable=False),
        sa.Column("prompt_version", sa.String(40), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("customer_message", sa.Text(), nullable=False),
        sa.Column("result_json", sa.JSON()),
        sa.Column("reply_text", sa.Text()),
        sa.Column("need_human", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("human_reason", sa.Text()),
        sa.Column("confidence", sa.Float()),
        sa.Column("prompt_tokens", sa.Integer()),
        sa.Column("completion_tokens", sa.Integer()),
        sa.Column("total_tokens", sa.Integer()),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("error_code", sa.String(100)),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_message_id"], ["messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_generation_tenant_request"),
    )
    for column in (
        "tenant_id",
        "agent_id",
        "customer_id",
        "conversation_id",
        "source_message_id",
        "status",
        "created_by_user_id",
        "created_at",
    ):
        op.create_index(f"ix_generation_records_{column}", "generation_records", [column])
    op.create_index(
        "ix_generation_records_tenant_created",
        "generation_records",
        ["tenant_id", "created_at"],
    )

    op.create_table(
        "generation_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("generation_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_chunk_id", sa.Uuid()),
        sa.Column("document_id", sa.Uuid()),
        sa.Column("citation_key", sa.String(20), nullable=False),
        sa.Column("citation_label", sa.String(600), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column("retrieval_score", sa.Float(), nullable=False),
        sa.Column("used_in_reply", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generation_id"], ["generation_records.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["knowledge_chunk_id"], ["knowledge_chunks.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("generation_id", "citation_key", name="uq_generation_source_key"),
    )
    for column in (
        "tenant_id",
        "generation_id",
        "knowledge_chunk_id",
        "document_id",
        "created_at",
    ):
        op.create_index(f"ix_generation_sources_{column}", "generation_sources", [column])

    op.create_table(
        "generation_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("generation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rating", sa.String(32), nullable=False),
        sa.Column("adopted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("edited_before_save", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("feedback_text", sa.Text()),
        *timestamps(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["generation_id"], ["generation_records.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "generation_id",
            "user_id",
            name="uq_generation_feedback_user",
        ),
    )
    for column in ("tenant_id", "generation_id", "user_id", "created_at"):
        op.create_index(f"ix_generation_feedback_{column}", "generation_feedback", [column])

    op.add_column("messages", sa.Column("generation_id", sa.Uuid()))
    op.add_column(
        "messages",
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "messages",
        sa.Column("is_user_edited", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_foreign_key(
        "fk_messages_generation_id_generation_records",
        "messages",
        "generation_records",
        ["generation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_messages_generation_id", "messages", ["generation_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_messages_generation_id", table_name="messages")
    op.drop_constraint(
        "fk_messages_generation_id_generation_records", "messages", type_="foreignkey"
    )
    op.drop_column("messages", "is_user_edited")
    op.drop_column("messages", "is_ai_generated")
    op.drop_column("messages", "generation_id")
    op.drop_table("generation_feedback")
    op.drop_table("generation_sources")
    op.drop_table("generation_records")
    op.drop_table("agent_configs")
    op.drop_table("agents")
