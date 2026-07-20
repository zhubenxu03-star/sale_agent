from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import AppException
from app.core.security import hash_password, verify_password
from app.models.agent import Agent, AgentConfig
from app.models.knowledge import KnowledgeBase
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import LoginRequest, RegisterTenantRequest

DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing-only")


def register_tenant(db: Session, payload: RegisterTenantRequest) -> tuple[Tenant, User]:
    try:
        with db.begin():
            existing_tenant = db.scalar(select(Tenant.id).where(Tenant.code == payload.tenant_code))
            if existing_tenant is not None:
                raise AppException(409, "企业编码已存在", "TENANT_CODE_CONFLICT")

            tenant = Tenant(
                name=payload.tenant_name,
                code=payload.tenant_code,
                status=TenantStatus.ACTIVE,
            )
            db.add(tenant)
            db.flush()

            user = User(
                tenant_id=tenant.id,
                name=payload.admin_name,
                email=str(payload.email),
                password_hash=hash_password(payload.password),
                role=UserRole.ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(user)
            db.flush()
            db.add(
                KnowledgeBase(
                    tenant_id=tenant.id,
                    name="企业知识库",
                    description="企业产品、服务、价格、案例、交付和常见问题资料",
                    created_by_user_id=user.id,
                )
            )
            agent = Agent(
                tenant_id=tenant.id,
                name="销转智能体",
                description="依据企业知识为销售提供可审计的回复建议",
                is_default=True,
                created_by_user_id=user.id,
            )
            db.add(agent)
            db.flush()
            db.add(
                AgentConfig(
                    tenant_id=tenant.id,
                    agent_id=agent.id,
                    identity_prompt=(
                        "你是企业销转智能体。请依据提供的企业知识，输出专业、克制、"
                        "可核验的销售建议，不得编造事实。"
                    ),
                    prohibited_claims=["未经依据不得承诺价格、折扣、交付、资质或效果"],
                    human_handoff_rules=[
                        "投诉退款",
                        "合同法律问题",
                        "特殊价格审批",
                        "客户要求人工",
                        "安全合规承诺",
                        "高价值商机",
                        "没有可靠知识",
                        "低置信度",
                    ],
                )
            )
    except IntegrityError as exc:
        db.rollback()
        raise AppException(409, "企业编码或邮箱已存在", "REGISTER_CONFLICT") from exc

    db.refresh(tenant)
    db.refresh(user)
    return tenant, user


def authenticate_user(db: Session, payload: LoginRequest) -> tuple[Tenant, User]:
    user = db.scalar(
        select(User)
        .join(Tenant, Tenant.id == User.tenant_id)
        .options(joinedload(User.tenant))
        .where(Tenant.code == payload.tenant_code, User.email == str(payload.email))
    )

    password_is_valid = verify_password(
        payload.password,
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH,
    )
    if (
        user is None
        or not password_is_valid
        or user.status != UserStatus.ACTIVE
        or user.tenant.status != TenantStatus.ACTIVE
    ):
        raise AppException(401, "企业编码、邮箱或密码错误", "LOGIN_FAILED")
    return user.tenant, user
