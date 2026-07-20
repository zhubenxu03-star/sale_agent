"""Add draft and published lifecycle metadata to agent configurations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260720_0005"
down_revision: str | None = "20260717_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agent_configs",
        sa.Column("enterprise_knowledge_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "generation_records",
        sa.Column("generation_type", sa.String(32), nullable=False, server_default="standard"),
    )
    op.create_index("ix_generation_records_generation_type", "generation_records", ["generation_type"])
    op.add_column("agent_configs", sa.Column("draft_config_json", sa.JSON(), nullable=True))
    op.add_column("agent_configs", sa.Column("published_config_json", sa.JSON(), nullable=True))
    op.add_column(
        "agent_configs",
        sa.Column("draft_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("agent_configs", sa.Column("published_version", sa.Integer(), nullable=True))
    op.add_column(
        "agent_configs", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("agent_configs", sa.Column("published_by_user_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_agent_configs_published_by_user_id_users",
        "agent_configs",
        "users",
        ["published_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_agent_configs_published_by_user_id",
        "agent_configs",
        ["published_by_user_id"],
    )


def downgrade() -> None:
    op.drop_column("agent_configs", "enterprise_knowledge_enabled")
    op.drop_index("ix_generation_records_generation_type", table_name="generation_records")
    op.drop_column("generation_records", "generation_type")
    op.drop_index("ix_agent_configs_published_by_user_id", table_name="agent_configs")
    op.drop_constraint(
        "fk_agent_configs_published_by_user_id_users", "agent_configs", type_="foreignkey"
    )
    op.drop_column("agent_configs", "published_by_user_id")
    op.drop_column("agent_configs", "published_at")
    op.drop_column("agent_configs", "published_version")
    op.drop_column("agent_configs", "draft_version")
    op.drop_column("agent_configs", "published_config_json")
    op.drop_column("agent_configs", "draft_config_json")
