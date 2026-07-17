from datetime import datetime
from math import ceil
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.conversation import ConversationStatus, SenderType


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: UUID
    title: str = Field(min_length=1, max_length=240)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    customer_id: UUID
    owner_user_id: UUID | None
    title: str
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationOut]
    page: int
    page_size: int
    total: int
    total_pages: int

    @classmethod
    def build(
        cls, *, items: list[ConversationOut], page: int, page_size: int, total: int
    ) -> "ConversationPage":
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=ceil(total / page_size) if total else 0,
        )


class MessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sender_type: SenderType
    content: str = Field(min_length=1)
    metadata_json: dict[str, Any] | None = None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conversation_id: UUID
    sender_type: SenderType
    content: str
    metadata_json: dict[str, Any] | None
    generation_id: UUID | None
    is_ai_generated: bool
    is_user_edited: bool
    created_at: datetime
