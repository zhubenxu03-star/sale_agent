from fastapi import APIRouter, status

from app.core.security import create_access_token
from app.dependencies.auth import CurrentUser, DbSession
from app.schemas.auth import (
    AuthIdentityData,
    LoginData,
    LoginRequest,
    RegisterTenantRequest,
)
from app.schemas.common import APIResponse, success_response
from app.services.auth import authenticate_user, register_tenant

router = APIRouter()


@router.post(
    "/register-tenant",
    response_model=APIResponse[AuthIdentityData],
    status_code=status.HTTP_201_CREATED,
)
def register_tenant_endpoint(payload: RegisterTenantRequest, db: DbSession) -> dict[str, object]:
    tenant, user = register_tenant(db, payload)
    return success_response(AuthIdentityData(user=user, tenant=tenant), "企业注册成功")


@router.post("/login", response_model=APIResponse[LoginData])
def login(payload: LoginRequest, db: DbSession) -> dict[str, object]:
    tenant, user = authenticate_user(db, payload)
    access_token = create_access_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=user.role.value,
    )
    return success_response(
        LoginData(
            access_token=access_token,
            user=user,
            tenant=tenant,
        ),
        "登录成功",
    )


@router.get("/me", response_model=APIResponse[AuthIdentityData])
def me(current_user: CurrentUser) -> dict[str, object]:
    return success_response(AuthIdentityData(user=current_user, tenant=current_user.tenant))
