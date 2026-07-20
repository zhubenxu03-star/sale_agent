"""Add draftable agent display name to agent configurations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260720_0006"
down_revision: str | None = "20260720_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "agent_configs",
        sa.Column("agent_name", sa.String(length=120), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE agent_configs AS config
            SET agent_name = agent.name
            FROM agents AS agent
            WHERE config.agent_id = agent.id
            """
        )
    )
    op.execute(
        sa.text(
            "UPDATE agent_configs SET agent_name = '企业销售顾问' WHERE agent_name IS NULL"
        )
    )
    op.alter_column("agent_configs", "agent_name", nullable=False)


def downgrade() -> None:
    op.drop_column("agent_configs", "agent_name")
