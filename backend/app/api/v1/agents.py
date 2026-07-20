from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.exceptions import AppException
from app.dependencies.auth import CurrentUser, DbSession
from app.models.agent import Agent, AgentConfig
from app.models.user import UserRole
from app.schemas.agent import AgentConfigOut, AgentConfigUpdate, AgentOut
from app.schemas.common import APIResponse, success_response
from app.services.agent.config_lifecycle import snapshot_config

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
    return success_response(config_out(_config_or_404(db, current_user.tenant_id, agent_id)))


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
    config.draft_version = (config.draft_version or config.version) + 1
    config.version = config.draft_version
    config.draft_config_json = snapshot_config(config)
    db.commit()
    db.refresh(config)
    return success_response(config_out(config), "智能体配置已保存为草稿")


@router.post("/{agent_id}/config/publish", response_model=APIResponse[AgentConfigOut])
def publish_agent_config(agent_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER}:
        raise AppException(403, "无权发布智能体配置", "AGENT_CONFIG_PUBLISH_FORBIDDEN")
    config = _config_or_404(db, current_user.tenant_id, agent_id)
    config.draft_config_json = snapshot_config(config)
    config.published_config_json = dict(config.draft_config_json)
    config.published_version = config.draft_version or config.version
    config.published_at = datetime.now(UTC)
    config.published_by_user_id = current_user.id
    db.commit()
    db.refresh(config)
    return success_response(config_out(config), "配置已发布，将影响新生成")


@router.post("/{agent_id}/config/restore", response_model=APIResponse[AgentConfigOut])
def restore_agent_config(agent_id: UUID, db: DbSession, current_user: CurrentUser) -> dict[str, object]:
    if current_user.role not in {UserRole.ADMIN, UserRole.MANAGER}:
        raise AppException(403, "无权恢复智能体配置", "AGENT_CONFIG_RESTORE_FORBIDDEN")
    config = _config_or_404(db, current_user.tenant_id, agent_id)
    if not config.published_config_json:
        raise AppException(409, "当前还没有可恢复的发布版本", "AGENT_CONFIG_NOT_PUBLISHED")
    for key, value in config.published_config_json.items():
        setattr(config, key, value)
    config.draft_version = (config.draft_version or config.version) + 1
    config.version = config.draft_version
    config.draft_config_json = dict(config.published_config_json)
    db.commit()
    db.refresh(config)
    return success_response(config_out(config), "已恢复为最近发布版本")


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


def config_out(config: AgentConfig) -> AgentConfigOut:
    return AgentConfigOut.model_validate(config).model_copy(
        update={"has_published_config": bool(config.published_config_json)}
    )
