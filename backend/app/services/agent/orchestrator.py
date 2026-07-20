import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.exceptions import AppException
from app.models.agent import (
    Agent,
    AgentConfig,
    AgentStatus,
    GenerationRecord,
    GenerationSource,
    GenerationStatus,
    GenerationType,
)
from app.models.champion import GenerationChampionSource
from app.models.conversation import Conversation, Message, SenderType
from app.models.customer import Customer
from app.models.knowledge import KnowledgeBase, KnowledgeBaseStatus
from app.models.user import User
from app.schemas.agent import AgentOutput, GenerationOut, GenerationRequest, GenerationSourceOut
from app.schemas.champion import ChampionSearchRequest
from app.schemas.knowledge import KnowledgeSearchRequest
from app.services.agent.concurrency import GenerationLease
from app.services.agent.config_lifecycle import effective_config
from app.services.agent.prompt_builder import (
    PROMPT_VERSION,
    PromptContext,
    build_prompt,
    build_repair_prompt,
)
from app.services.agent.safety import apply_safety_rules, validate_citations
from app.services.champion.retrieval import search_champion
from app.services.knowledge.retrieval import search_knowledge
from app.services.llm import get_chat_provider
from app.services.llm.base import ChatProvider
from app.services.llm.errors import ChatProviderError
from app.services.llm.schemas import GenerationSettings


async def generate_reply(
    db: Session,
    current_user: User,
    payload: GenerationRequest,
    provider: ChatProvider | None = None,
    progress: Callable[[str, dict[str, object]], None] | None = None,
    use_published_config: bool = True,
    config_overrides: dict[str, object] | None = None,
    generation_type: GenerationType = GenerationType.STANDARD,
    use_enterprise_knowledge: bool = True,
    use_champion_knowledge: bool = True,
) -> GenerationRecord:
    existing = _record_by_request(db, current_user.tenant_id, payload.request_id)
    if existing is not None:
        return existing
    async with GenerationLease(current_user.id):
        existing = _record_by_request(db, current_user.tenant_id, payload.request_id)
        if existing is not None:
            return existing
        agent, config, customer, conversation, source_message = _validate_scope(
            db, current_user.tenant_id, payload, use_published_config=use_published_config
        )
        if config_overrides:
            for key, value in config_overrides.items():
                setattr(config, key, value)
        chat_provider = provider or get_chat_provider()
        provider_name = get_settings().llm_provider
        record = GenerationRecord(
            tenant_id=current_user.tenant_id,
            agent_id=agent.id,
            customer_id=customer.id,
            conversation_id=conversation.id,
            source_message_id=source_message.id,
            request_id=payload.request_id,
            status=GenerationStatus.QUEUED,
            generation_type=generation_type,
            provider=provider_name,
            model_name=getattr(chat_provider, "model_name", get_settings().llm_model or "unknown"),
            embedding_mode=get_settings().embedding_provider,
            prompt_version=PROMPT_VERSION,
            config_version=config.version,
            customer_message=source_message.content,
            created_by_user_id=current_user.id,
        )
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            duplicate = _record_by_request(db, current_user.tenant_id, payload.request_id)
            if duplicate is not None:
                return duplicate
            raise
        db.refresh(record)
        if progress:
            progress(
                "analyzing",
                {"message": "正在分析客户需求", "generation_id": str(record.id)},
            )
        started = time.perf_counter()
        try:
            record.status = GenerationStatus.RETRIEVING
            db.commit()
            if progress:
                progress(
                    "retrieving",
                    {"message": "正在检索企业知识", "generation_id": str(record.id)},
                )
            sources = (
                _retrieve_sources(db, current_user, customer, config, record)
                if use_enterprise_knowledge and config.enterprise_knowledge_enabled
                else []
            )
            if progress:
                progress(
                    "sources",
                    {
                        "message": f"已找到 {len(sources)} 条相关资料",
                        "count": len(sources),
                        "generation_id": str(record.id),
                    },
                )
            champion_sources = (
                _retrieve_champion_sources(
                    db, current_user, customer, config, record, source_message.content
                )
                if use_champion_knowledge
                else []
            )
            if progress:
                progress(
                    "champion_retrieval_started",
                    {"message": "正在检索已审核销冠经验", "generation_id": str(record.id)},
                )
                progress(
                    "champion_retrieval_completed",
                    {"message": f"已匹配 {len(champion_sources)} 条销冠经验", "count": len(champion_sources), "generation_id": str(record.id)},
                )
                progress(
                    "champion_sources",
                    {"sources": [{"strategy_key": source.strategy_key, "title": source.title_snapshot, "score": source.retrieval_score} for source in champion_sources], "generation_id": str(record.id)},
                )
            history = _history(db, conversation.id, current_user.tenant_id)
            prompt = build_prompt(
                PromptContext(
                    customer=customer,
                    config=config,
                    history=history,
                    sources=sources,
                    customer_message=source_message.content,
                    mode=payload.mode,
                    champion_sources=_champion_cards_for_prompt(db, champion_sources),
                )
            )
            record.status = GenerationStatus.GENERATING
            db.commit()
            if progress:
                progress(
                    "generating",
                    {"message": "正在组织销转策略并生成回复", "generation_id": str(record.id)},
                )
            settings = GenerationSettings(
                temperature=config.temperature,
                max_output_tokens=config.max_output_tokens,
                json_schema=AgentOutput.model_json_schema(),
            )
            result = await chat_provider.generate(prompt, settings)
            output = await _parse_or_repair(chat_provider, prompt, settings, result.content)
            output = validate_citations(output, {source.citation_key for source in sources})
            output = apply_safety_rules(
                output,
                source_message.content,
                bool(sources),
                "\n".join(
                    [source_message.content, *(source.content_snapshot for source in sources)]
                ),
            )
            champion_risks = [
                risk
                for source in _champion_cards_for_prompt(db, champion_sources)
                for risk in (source.risk_notes or [])
            ]
            if champion_risks:
                output.risk_flags = list(dict.fromkeys([*output.risk_flags, "DISCOUNT_APPROVAL_REQUIRED"]))
                if not output.need_human and any("承诺" in risk or "折扣" in risk or "价格" in risk for risk in champion_risks):
                    output.need_human = True
                    output.human_reason = "销冠经验包含需要人工确认的风险提示"
            if progress:
                progress(
                    "validating",
                    {"message": "正在校验引用与风险", "generation_id": str(record.id)},
                )
            used_keys = {citation.citation_key for citation in output.citations}
            valid_strategy_keys = {source.strategy_key for source in champion_sources}
            output.champion_methods_used = [
                method for method in output.champion_methods_used if method.strategy_key in valid_strategy_keys
            ]
            used_strategy_keys = {method.strategy_key for method in output.champion_methods_used}
            for source in champion_sources:
                source.used_in_strategy = source.strategy_key in used_strategy_keys
            for source in sources:
                source.used_in_reply = source.citation_key in used_keys
            record.status = GenerationStatus.COMPLETED
            record.model_name = result.model_name
            record.result_json = output.model_dump(mode="json")
            record.reply_text = output.reply_text
            record.need_human = output.need_human
            record.human_reason = output.human_reason
            record.confidence = output.confidence
            record.prompt_tokens = result.usage.prompt_tokens
            record.completion_tokens = result.usage.completion_tokens
            record.total_tokens = result.usage.total_tokens
            record.duration_ms = round((time.perf_counter() - started) * 1000)
            record.completed_at = datetime.now(UTC)
            db.commit()
            return _record_or_404(db, current_user.tenant_id, record.id)
        except (ChatProviderError, AppException) as exc:
            _mark_failed(
                db,
                record,
                getattr(exc, "code", getattr(exc, "error_code", "GENERATION_FAILED")),
                str(exc),
                started,
            )
            raise AppException(
                getattr(exc, "status_code", 502),
                getattr(exc, "safe_message", getattr(exc, "message", "生成服务暂不可用")),
                getattr(exc, "code", getattr(exc, "error_code", "GENERATION_FAILED")),
            ) from exc
        except (ValidationError, json.JSONDecodeError) as exc:
            _mark_failed(db, record, "MODEL_OUTPUT_INVALID", "模型输出结构校验失败", started)
            raise AppException(502, "模型输出结构校验失败", "MODEL_OUTPUT_INVALID") from exc


async def _parse_or_repair(
    provider: ChatProvider,
    prompt: list,
    settings: GenerationSettings,
    content: str,
) -> AgentOutput:
    try:
        return AgentOutput.model_validate(json.loads(_json_content(content)))
    except (ValidationError, json.JSONDecodeError):
        repair = await provider.generate(build_repair_prompt(prompt, content), settings)
        return AgentOutput.model_validate(json.loads(_json_content(repair.content)))


def _json_content(content: str) -> str:
    value = content.strip()
    if value.startswith("```"):
        value = value.split("\n", 1)[1].rsplit("```", 1)[0]
    if not value:
        raise ChatProviderError("大模型返回了空内容", "LLM_EMPTY_RESPONSE", 502)
    return value


def _validate_scope(
    db: Session, tenant_id: UUID, payload: GenerationRequest, *, use_published_config: bool = True
) -> tuple[Agent, AgentConfig, Customer, Conversation, Message]:
    agent = db.scalar(
        select(Agent).where(
            Agent.id == payload.agent_id,
            Agent.tenant_id == tenant_id,
            Agent.status == AgentStatus.ACTIVE,
        )
    )
    if agent is None:
        raise AppException(404, "智能体不存在", "AGENT_NOT_FOUND")
    config = db.scalar(
        select(AgentConfig).where(
            AgentConfig.agent_id == agent.id, AgentConfig.tenant_id == tenant_id
        )
    )
    customer = db.scalar(
        select(Customer).where(Customer.id == payload.customer_id, Customer.tenant_id == tenant_id)
    )
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == payload.conversation_id,
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == payload.customer_id,
        )
    )
    message = db.scalar(
        select(Message).where(
            Message.id == payload.source_message_id,
            Message.tenant_id == tenant_id,
            Message.conversation_id == payload.conversation_id,
            Message.sender_type == SenderType.CUSTOMER,
        )
    )
    if config is None or customer is None or conversation is None or message is None:
        raise AppException(404, "客户、会话或客户消息不存在", "GENERATION_CONTEXT_NOT_FOUND")
    return agent, effective_config(config, published=use_published_config), customer, conversation, message


def _retrieve_sources(
    db: Session,
    user: User,
    customer: Customer,
    config: AgentConfig,
    record: GenerationRecord,
) -> list[GenerationSource]:
    knowledge_base = db.scalar(
        select(KnowledgeBase).where(
            KnowledgeBase.tenant_id == user.tenant_id,
            KnowledgeBase.status == KnowledgeBaseStatus.ACTIVE,
        )
    )
    query_parts = [
        record.customer_message,
        *(customer.core_needs or [])[:3],
        *(customer.objections or [])[:3],
    ]
    if customer.stage:
        query_parts.append(str(customer.stage))
    data = search_knowledge(
        db,
        user.tenant_id,
        user.id,
        KnowledgeSearchRequest(
            query="；".join(str(item) for item in query_parts if item)[:4000],
            knowledge_base_id=knowledge_base.id if knowledge_base else None,
            top_k=config.default_top_k,
            min_score=config.default_min_score,
        ),
    )
    sources: list[GenerationSource] = []
    chars = 0
    seen_documents: set[UUID] = set()
    pending = sorted(data.results, key=lambda item: -item.score)
    ordered = []
    while pending:
        diverse_index = next(
            (index for index, item in enumerate(pending) if item.document_id not in seen_documents),
            0,
        )
        item = pending.pop(diverse_index)
        ordered.append(item)
        seen_documents.add(item.document_id)
    seen_documents.clear()
    for index, item in enumerate(ordered, 1):
        remaining = get_settings().agent_max_knowledge_chars - chars
        if remaining <= 0:
            break
        snapshot = item.content[:remaining]
        if not snapshot:
            break
        source = GenerationSource(
            tenant_id=user.tenant_id,
            generation_id=record.id,
            knowledge_chunk_id=item.chunk_id,
            document_id=item.document_id,
            citation_key=f"K{index}",
            citation_label=item.citation_label,
            content_snapshot=snapshot,
            retrieval_score=item.score,
        )
        db.add(source)
        sources.append(source)
        chars += len(snapshot)
        seen_documents.add(item.document_id)
    db.commit()
    return sources


def _retrieve_champion_sources(
    db: Session,
    user: User,
    customer: Customer,
    config: AgentConfig,
    record: GenerationRecord,
    customer_message: str,
) -> list[GenerationChampionSource]:
    if not config.champion_enabled:
        return []
    query = " ".join(
        [customer_message, *(customer.objections or [])[:2], *(customer.core_needs or [])[:2], str(customer.stage or "")]
    )[:4000]
    results = search_champion(
        db,
        user.tenant_id,
        user.id,
        ChampionSearchRequest(
            query=query,
            customer_id=customer.id,
            conversation_id=record.conversation_id,
            industry=customer.industry,
            sales_stage=str(customer.stage or ""),
            top_k=config.champion_top_k,
            min_score=config.champion_min_score,
        ),
        config,
    )
    sources: list[GenerationChampionSource] = []
    for result in results:
        source = GenerationChampionSource(
            tenant_id=user.tenant_id,
            generation_id=record.id,
            champion_card_id=result.id,
            strategy_key=result.strategy_key,
            title_snapshot=result.title,
            card_type=result.card_type.value if hasattr(result.card_type, "value") else str(result.card_type),
            strategy_snapshot=result.strategy_summary,
            reply_snapshot=result.salesperson_reply,
            retrieval_score=result.final_score,
        )
        db.add(source)
        sources.append(source)
    db.commit()
    return sources


def _champion_cards_for_prompt(db: Session, sources: list[GenerationChampionSource]) -> list[object]:
    from app.models.champion import ChampionCard

    ids = [source.champion_card_id for source in sources if source.champion_card_id]
    if not ids:
        return []
    return list(db.scalars(select(ChampionCard).where(ChampionCard.id.in_(ids))))


def _history(db: Session, conversation_id: UUID, tenant_id: UUID) -> list[Message]:
    limit = get_settings().agent_history_message_limit
    messages = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id, Message.tenant_id == tenant_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(limit)
        )
    )
    return list(reversed(messages))


def _record_by_request(db: Session, tenant_id: UUID, request_id: str) -> GenerationRecord | None:
    return db.scalar(
        select(GenerationRecord)
        .options(selectinload(GenerationRecord.sources), selectinload(GenerationRecord.champion_sources))
        .where(GenerationRecord.tenant_id == tenant_id, GenerationRecord.request_id == request_id)
    )


def _record_or_404(db: Session, tenant_id: UUID, record_id: UUID) -> GenerationRecord:
    record = db.scalar(
        select(GenerationRecord)
        .options(selectinload(GenerationRecord.sources), selectinload(GenerationRecord.champion_sources))
        .where(GenerationRecord.id == record_id, GenerationRecord.tenant_id == tenant_id)
    )
    if record is None:
        raise AppException(404, "生成记录不存在", "GENERATION_NOT_FOUND")
    return record


def _mark_failed(
    db: Session, record: GenerationRecord, code: str, message: str, started: float
) -> None:
    record.status = GenerationStatus.FAILED
    record.error_code = code
    record.error_message = message[:1000]
    record.duration_ms = round((time.perf_counter() - started) * 1000)
    record.completed_at = datetime.now(UTC)
    db.commit()


def generation_out(record: GenerationRecord) -> GenerationOut:
    champion_sources = list(record.champion_sources)
    return GenerationOut(
        id=record.id,
        request_id=record.request_id,
        status=record.status,
        generation_type=record.generation_type.value if hasattr(record.generation_type, "value") else str(record.generation_type),
        agent_id=record.agent_id,
        customer_id=record.customer_id,
        conversation_id=record.conversation_id,
        source_message_id=record.source_message_id,
        provider=record.provider,
        model_name=record.model_name,
        embedding_mode=record.embedding_mode,
        prompt_version=record.prompt_version,
        config_version=record.config_version,
        result=AgentOutput.model_validate(record.result_json) if record.result_json else None,
        reply_text=record.reply_text,
        need_human=record.need_human,
        human_reason=record.human_reason,
        confidence=record.confidence,
        prompt_tokens=record.prompt_tokens,
        completion_tokens=record.completion_tokens,
        total_tokens=record.total_tokens,
        duration_ms=record.duration_ms,
        error_code=record.error_code,
        error_message=record.error_message,
        sources=[
            GenerationSourceOut(
                citation_key=item.citation_key,
                citation_label=item.citation_label,
                content_snapshot=item.content_snapshot,
                retrieval_score=item.retrieval_score,
                used_in_reply=item.used_in_reply,
                document_available=item.document_id is not None,
            )
            for item in record.sources
        ],
        champion_sources=[
            {
                "strategy_key": item.strategy_key,
                "title_snapshot": item.title_snapshot,
                "card_type": item.card_type,
                "strategy_snapshot": item.strategy_snapshot,
                "reply_snapshot": item.reply_snapshot,
                "retrieval_score": item.retrieval_score,
                "used_in_strategy": item.used_in_strategy,
            }
            for item in champion_sources
        ],
        created_at=record.created_at,
        completed_at=record.completed_at,
    )
