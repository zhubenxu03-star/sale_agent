"""Add enterprise knowledge base and pgvector retrieval schema.

Revision ID: 20260717_0002
Revises: 20260717_0001
Create Date: 2026-07-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "20260717_0002"
down_revision: str | None = "20260717_0001"
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
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("knowledge_type", sa.String(24), nullable=False, server_default="company"),
        sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        *timestamps(),
        sa.CheckConstraint("knowledge_type IN ('company')", name="knowledge_type_values"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="knowledge_base_status_values"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_knowledge_bases_tenant"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name="fk_knowledge_bases_creator",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_knowledge_bases"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_knowledge_bases_tenant_name"),
    )
    op.create_index("ix_knowledge_bases_tenant_id", "knowledge_bases", ["tenant_id"])
    op.create_index("ix_knowledge_bases_created_at", "knowledge_bases", ["created_at"])

    op.execute(
        """
        INSERT INTO knowledge_bases
            (id, tenant_id, name, description, knowledge_type, status, created_by_user_id)
        SELECT gen_random_uuid(), t.id, '企业知识库',
               '企业产品、服务、价格、案例、交付和常见问题资料',
               'company', 'active',
               (SELECT u.id FROM users u WHERE u.tenant_id = t.id
                ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at LIMIT 1)
        FROM tenants t
        WHERE EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id)
        """
    )

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("file_extension", sa.String(16), nullable=False),
        sa.Column("mime_type", sa.String(160), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="uploaded"),
        sa.Column("processing_stage", sa.String(24), nullable=False, server_default="waiting"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_code", sa.String(80)),
        sa.Column("error_message", sa.Text()),
        sa.Column("uploaded_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "status IN ('uploaded','processing','ready','failed','disabled')",
            name="knowledge_document_status_values",
        ),
        sa.CheckConstraint(
            "processing_stage IN ('waiting','parsing','chunking','embedding','saving',"
            "'completed','failed')",
            name="knowledge_processing_stage_values",
        ),
        sa.CheckConstraint("progress >= 0 AND progress <= 100", name="knowledge_progress_range"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_knowledge_documents_tenant"
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_base_id"],
            ["knowledge_bases.id"],
            ondelete="CASCADE",
            name="fk_knowledge_documents_base",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
            name="fk_knowledge_documents_uploader",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_knowledge_documents"),
        sa.UniqueConstraint("storage_key", name="uq_knowledge_documents_storage_key"),
        sa.UniqueConstraint(
            "knowledge_base_id", "sha256", name="uq_knowledge_documents_base_sha256"
        ),
    )
    for column in ["tenant_id", "knowledge_base_id", "status", "created_at"]:
        op.create_index(f"ix_knowledge_documents_{column}", "knowledge_documents", [column])
    op.create_index(
        "ix_knowledge_documents_tenant_sha256", "knowledge_documents", ["tenant_id", "sha256"]
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("knowledge_base_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("sheet_name", sa.String(160)),
        sa.Column("row_start", sa.Integer()),
        sa.Column("row_end", sa.Integer()),
        sa.Column("section_title", sa.String(500)),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_knowledge_chunks_tenant"
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_base_id"],
            ["knowledge_bases.id"],
            ondelete="CASCADE",
            name="fk_knowledge_chunks_base",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["knowledge_documents.id"],
            ondelete="CASCADE",
            name="fk_knowledge_chunks_document",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_knowledge_chunks"),
        sa.UniqueConstraint(
            "tenant_id",
            "document_id",
            "chunk_index",
            name="uq_knowledge_chunks_tenant_document_index",
        ),
    )
    for column in ["tenant_id", "knowledge_base_id", "document_id", "created_at"]:
        op.create_index(f"ix_knowledge_chunks_{column}", "knowledge_chunks", [column])
    op.execute(
        "CREATE INDEX ix_knowledge_chunks_embedding_hnsw ON knowledge_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "knowledge_processing_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("celery_task_id", sa.String(255)),
        sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text()),
        *timestamps(),
        sa.CheckConstraint(
            "status IN ('queued','running','success','failed')", name="knowledge_job_status_values"
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_knowledge_jobs_tenant"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["knowledge_documents.id"],
            ondelete="CASCADE",
            name="fk_knowledge_jobs_document",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_knowledge_processing_jobs"),
    )
    for column in ["tenant_id", "document_id", "celery_task_id", "status", "created_at"]:
        op.create_index(
            f"ix_knowledge_processing_jobs_{column}", "knowledge_processing_jobs", [column]
        )

    op.create_table(
        "knowledge_retrieval_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("knowledge_base_id", sa.Uuid()),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column("top_score", sa.Float()),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("embedding_provider", sa.String(80), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE", name="fk_knowledge_logs_tenant"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="SET NULL", name="fk_knowledge_logs_user"
        ),
        sa.ForeignKeyConstraint(
            ["knowledge_base_id"],
            ["knowledge_bases.id"],
            ondelete="SET NULL",
            name="fk_knowledge_logs_base",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_knowledge_retrieval_logs"),
    )
    for column in ["tenant_id", "user_id", "knowledge_base_id", "created_at"]:
        op.create_index(
            f"ix_knowledge_retrieval_logs_{column}", "knowledge_retrieval_logs", [column]
        )


def downgrade() -> None:
    op.drop_table("knowledge_retrieval_logs")
    op.drop_table("knowledge_processing_jobs")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_embedding_hnsw")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")
    op.drop_table("knowledge_bases")
    op.execute("DROP EXTENSION IF EXISTS vector")
