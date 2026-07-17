from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.agent import Agent, AgentConfig
from app.models.user import UserRole
from app.schemas.agent import AgentConfigOut, AgentConfigUpdate, AgentOut
from app.schemas.common import APIResponse, success_response

router = APIRouter()


@router.get("", response_model=APIResponse[list[AgentOut]])
def list_agents(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    agents = list(
        db.scalars(
            select(Agent)
            .where(Agent.tenant_id == current_user.tenant_id)
            .order_by(Agent.is_default.desc(), Agent.created_at.asc())
        )
    )
    return success_response([AgentOut.model_validate(item) for item in agents])


@router.get("/default", response_model=APIResponse[AgentOut])
def get_default_agent(db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    agent = db.scalar(
        select(Agent).where(Agent.tenant_id == current_user.tenant_id, Agent.is_default.is_(True))
    )
    if agent is None:
        raise AppException(404, "默认智能体不存在", "DEFAULT_AGENT_NOT_FOUND")
    return success_response(AgentOut.model_validate(agent))


@router.get("/{agent_id}/config", response_model=APIResponse[AgentConfigOut])
def get_agent_config(agent_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    return success_response(
        AgentConfigOut.model_validate(_config_or_404(db, current_user.tenant_id, agent_id))
    )


@router.put("/{agent_id}/config", response_model=APIResponse[AgentConfigOut])
def update_agent_config(
    agent_id: UUID, payload: AgentConfigUpdate, db: DbSession, current_user: CurrentUser
) -> dict[str, object]:
    if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER}:
        raise AppException(403, "无权修改智能体配置", "AGENT_CONFIG_FORBIDDEN")
    changes = payload.model_dump(exclude_unset=True)
    protected = {"identity_prompt", "prohibited_claims", "human_handoff_rules"}
    if current_user.role != UserRole.ADMIN and protected.intersection(changes):
        raise AppException(403, "仅管理员可修改核心安全规则", "AGENT_SECURITY_CONFIG_FORBIDDEN")
    config = _config_or_404(db, current_user.tenant_id, agent_id)
    for key, value in changes.items():
        setattr(config, key, value)
    config.version += 1
    db.commit()
    db.refresh(config)
    return success_response(AgentConfigOut.model_validate(config), "智能体配置已更新")


def _config_or_404(db: DbSession, tenant_id: UUID, agent_id: UUID) -> AgentConfig:
    config = db.scalar(
        select(AgentConfig)
        .join(Agent, Agent.id == AgentConfig.agent_id)
        .where(
            AgentConfig.agent_id == agent_id,
            AgentConfig.tenant_id == tenant_id,
            Agent.tenant_id == tenant_id,
        )
    )
    if config is None:
        raise AppException(404, "智能体配置不存在", "AGENT_CONFIG_NOT_FOUND")
    return config
