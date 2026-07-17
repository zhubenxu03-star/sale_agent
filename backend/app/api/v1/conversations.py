from uuid import UUID

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.conversation import Conversation, ConversationStatus, Message
from app.models.customer import Customer
from app.schemas.common import APIResponse, success_response
from app.schemas.conversation import (
    ConversationCreate,
    ConversationOut,
    ConversationPage,
    MessageCreate,
    MessageOut,
)

router = APIRouter()


def find_conversation_or_404(db: Session, conversation_id: UUID, tenant_id: UUID) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.tenant_id == tenant_id,
        )
    )
    if conversation is None:
        raise AppException(404, "会话不存在", "CONVERSATION_NOT_FOUND")
    return conversation


@router.get("", response_model=APIResponse[ConversationPage])
def list_conversations(
    db: DbSession,
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: ConversationStatus | None = Query(default=None, alias="status"),
) -> dict[str, object]:
    filters = [Conversation.tenant_id == current_user.tenant_id]
    if status_filter is not None:
        filters.append(Conversation.status == status_filter)

    total = db.scalar(select(func.count()).select_from(Conversation).where(*filters)) or 0
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(*filters)
            .order_by(Conversation.created_at.desc(), Conversation.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return success_response(
        ConversationPage.build(
            items=[ConversationOut.model_validate(item) for item in conversations],
            page=page,
            page_size=page_size,
            total=total,
        )
    )


@router.post(
    "",
    response_model=APIResponse[ConversationOut],
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    payload: ConversationCreate, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    customer_exists = db.scalar(
        select(Customer.id).where(
            Customer.id == payload.customer_id,
            Customer.tenant_id == current_user.tenant_id,
        )
    )
    if customer_exists is None:
        raise AppException(404, "客户不存在", "CUSTOMER_NOT_FOUND")

    conversation = Conversation(
        tenant_id=current_user.tenant_id,
        customer_id=payload.customer_id,
        owner_user_id=current_user.id,
        title=payload.title,
        status=ConversationStatus.ACTIVE,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return success_response(ConversationOut.model_validate(conversation), "会话创建成功")


@router.get("/{conversation_id}", response_model=APIResponse[ConversationOut])
def get_conversation(
    conversation_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    conversation = find_conversation_or_404(db, conversation_id, current_user.tenant_id)
    return success_response(ConversationOut.model_validate(conversation))


@router.post(
    "/{conversation_id}/messages",
    response_model=APIResponse[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    conversation_id: UUID,
    payload: MessageCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> dict[str, object]:
    find_conversation_or_404(db, conversation_id, current_user.tenant_id)
    message = Message(
        tenant_id=current_user.tenant_id,
        conversation_id=conversation_id,
        sender_type=payload.sender_type,
        content=payload.content,
        metadata_json=payload.metadata_json,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return success_response(MessageOut.model_validate(message), "消息创建成功")


@router.get("/{conversation_id}/messages", response_model=APIResponse[list[MessageOut]])
def list_messages(
    conversation_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    find_conversation_or_404(db, conversation_id, current_user.tenant_id)
    messages = list(
        db.scalars(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.tenant_id == current_user.tenant_id,
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
        )
    )
    return success_response([MessageOut.model_validate(item) for item in messages])


@router.patch("/{conversation_id}/archive", response_model=APIResponse[ConversationOut])
def archive_conversation(
    conversation_id: UUID, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    conversation = find_conversation_or_404(db, conversation_id, current_user.tenant_id)
    conversation.status = ConversationStatus.ARCHIVED
    db.commit()
    db.refresh(conversation)
    return success_response(ConversationOut.model_validate(conversation), "会话已归档")
