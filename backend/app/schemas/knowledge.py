from __future__ import annotations

from datetime import datetime
from math import ceil
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.knowledge import (
    DocumentStatus,
    KnowledgeBaseStatus,
    KnowledgeType,
    ProcessingStage,
)


class KnowledgeBaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("knowledge base name cannot be blank")
        return value.strip()


class KnowledgeBaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    status: KnowledgeBaseStatus | None = None

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: str | None) -> str:
        if value is None or not value.strip():
            raise ValueError("knowledge base name cannot be blank")
        return value.strip()


class KnowledgeBaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    knowledge_type: KnowledgeType
    status: KnowledgeBaseStatus
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    ready_document_count: int = 0
    chunk_count: int = 0


class KnowledgeDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    knowledge_base_id: UUID
    original_filename: str
    display_name: str
    file_extension: str
    mime_type: str
    size_bytes: int
    sha256: str
    status: DocumentStatus
    processing_stage: ProcessingStage
    progress: int
    chunk_count: int
    error_code: str | None
    error_message: str | None
    uploaded_by_user_id: UUID
    uploaded_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None


class KnowledgeDocumentPage(BaseModel):
    items: list[KnowledgeDocumentOut]
    page: int
    page_size: int
    total: int
    total_pages: int

    @classmethod
    def build(
        cls, *, items: list[KnowledgeDocumentOut], page: int, page_size: int, total: int
    ) -> KnowledgeDocumentPage:
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=ceil(total / page_size) if total else 0,
        )


class KnowledgeChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    chunk_index: int
    content: str
    content_hash: str
    token_count: int
    page_number: int | None
    sheet_name: str | None
    row_start: int | None
    row_end: int | None
    section_title: str | None
    metadata_json: dict | None
    created_at: datetime


class KnowledgeChunkPage(BaseModel):
    items: list[KnowledgeChunkOut]
    page: int
    page_size: int
    total: int
    total_pages: int


class KnowledgeSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=4000)
    knowledge_base_id: UUID | None = None
    top_k: int = Field(default=5, ge=1, le=20)
    min_score: float = Field(default=0.35, ge=0, le=1)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("query cannot be blank")
        return value.strip()


class KnowledgeSearchResult(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_name: str
    content: str
    score: float
    page_number: int | None
    sheet_name: str | None
    row_start: int | None
    row_end: int | None
    section_title: str | None
    citation_label: str


class KnowledgeSearchData(BaseModel):
    query: str
    results: list[KnowledgeSearchResult]
    embedding_mode: str
    duration_ms: int
