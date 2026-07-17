from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppException
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.tenant import TenantStatus
from app.models.user import User, UserStatus
from app.schemas.auth import TokenPayload

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppException(401, "未登录或 Token 无效", "UNAUTHORIZED")

    try:
        claims = TokenPayload.model_validate(decode_access_token(credentials.credentials))
    except (jwt.PyJWTError, ValidationError, ValueError):
        raise AppException(401, "未登录或 Token 无效", "INVALID_TOKEN") from None

    user = db.scalar(
        select(User)
        .options(joinedload(User.tenant))
        .where(User.id == claims.user_id, User.tenant_id == claims.tenant_id)
    )
    if (
        user is None
        or user.status != UserStatus.ACTIVE
        or user.tenant.status != TenantStatus.ACTIVE
        or user.role != claims.role
    ):
        raise AppException(401, "未登录或 Token 无效", "INVALID_TOKEN")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]
