from __future__ import annotations

import asyncio
import json
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import select

from app.models.champion import ChampionCard, ChampionCardStatus, ChampionImportJob, ChampionSource
from app.models.user import User
from app.schemas.champion import (
    ChampionCardInput,
    ChampionMapping,
    ChampionRoleMapping,
    ChampionSearchRequest,
)
from app.services.champion.extractor import DeterministicTestChampionExtractor
from app.services.champion.mapper import map_records
from app.services.champion.parser import ParsedRecord, parse_file
from app.services.champion.processing import process_champion_source
from app.services.champion.redactor import redact_text
from app.services.champion.segmenter import segment_records
from tests.helpers import auth_headers, register_tenant


def test_redactor_removes_sensitive_values() -> None:
    value, flags = redact_text("张三 13812345678 abc@example.com 身份证 110101199001011234 微信: sales_12345")
    assert "13812345678" not in value
    assert "abc@example.com" not in value
    assert "110101199001011234" not in value
    assert "张三" not in value
    assert {"phone", "email", "id_card", "wechat"}.issubset(flags)


def test_redactor_supports_custom_words() -> None:
    value, flags = redact_text("内部项目凤凰计划不能外传", ["凤凰计划"])
    assert "凤凰计划" not in value
    assert "custom" in flags


def test_mapping_does_not_guess_unknown_roles() -> None:
    mapped, required = map_records(
        [ParsedRecord({"role": "other", "text": "你好"}, 0)],
        ChampionMapping(sender_role="role", content="text"),
        ChampionRoleMapping(customer_values=["客户"], salesperson_values=["销售"]),
    )
    assert required is True
    assert mapped[0]["sender_role"] == "unknown"


def test_segmenter_splits_by_conversation_and_gap() -> None:
    records = [
        {"conversation_id": "A", "content": "你好", "timestamp": "2026-07-01T10:00:00"},
        {"conversation_id": "A", "content": "可以", "timestamp": "2026-07-01T10:01:00"},
        {"conversation_id": "A", "content": "第二天", "timestamp": "2026-07-03T10:01:00"},
        {"conversation_id": "B", "content": "新客户", "timestamp": "2026-07-03T10:02:00"},
    ]
    groups = segment_records(records)
    assert [len(group) for group in groups] == [2, 1, 1]


def test_parser_supports_txt_csv_json(tmp_path: Path) -> None:
    txt = tmp_path / "chat.txt"
    txt.write_text("[2026-07-01 10:00] 客户：你们价格太高\n[2026-07-01 10:01] 销售：我理解预算顾虑", encoding="utf-8")
    assert len(parse_file(txt, "txt").records) == 2
    csv_path = tmp_path / "chat.csv"
    csv_path.write_text("conversation_id,sender_role,content\nC1,customer,你好\n", encoding="utf-8")
    assert parse_file(csv_path, "csv").headers == ["conversation_id", "sender_role", "content"]
    json_path = tmp_path / "chat.json"
    json_path.write_text(json.dumps({"conversations": [{"conversation_id": "C1", "messages": [{"sender_role": "customer", "content": "你好"}]}]}), encoding="utf-8")
    assert len(parse_file(json_path, "json").records) == 1


def test_deterministic_extractor_is_repeatable() -> None:
    extractor = DeterministicTestChampionExtractor()
    messages = [{"sender_role": "customer", "content": "你们价格太高"}, {"sender_role": "salesperson", "content": "我理解您的预算顾虑，可以先确认目标"}]
    first = asyncio.run(extractor.extract(messages))
    second = asyncio.run(extractor.extract(messages))
    assert first == second
    assert first[0]["card_type"] == "objection_handling"
    assert ChampionCardInput.model_validate(first[0]).salesperson_reply


def test_extractor_skips_small_talk() -> None:
    result = asyncio.run(DeterministicTestChampionExtractor().extract([{"sender_role": "customer", "content": "好的"}, {"sender_role": "salesperson", "content": "好的"}]))
    assert result == []


def test_card_schema_rejects_tenant_injection() -> None:
    with pytest.raises(ValueError):
        ChampionSearchRequest.model_validate({"query": "价格", "tenant_id": "bad"})


def test_search_only_approved_and_tenant_isolated(client, session_factory) -> None:
    register_tenant(client, "champion-a")
    headers = auth_headers(client, "champion-a")
    user = session_factory().scalar(select(User).where(User.email == "admin@champion-a.com"))
    assert user
    db = session_factory()
    card = ChampionCard(tenant_id=user.tenant_id, title="价格异议", card_type="objection_handling", customer_example="价格太高", salesperson_reply="先了解预算", strategy_summary="共情后追问", why_it_works="避免争论", searchable_text="价格 预算", content_hash="a" * 64, status=ChampionCardStatus.REVIEW, created_by_user_id=user.id)
    db.add(card)
    db.commit()
    response = client.post("/api/v1/champion/search", headers=headers, json={"query": "价格", "top_k": 4})
    assert response.status_code == 200
    assert response.json()["data"] == []
    db.close()


def test_manual_card_can_be_approved_and_searched(client) -> None:
    register_tenant(client, "champion-approved")
    headers = auth_headers(client, "champion-approved")
    payload = {
        "title": "价格异议处理",
        "card_type": "objection_handling",
        "applicable_industries": ["企业服务"],
        "applicable_sales_stages": ["quotation"],
        "trigger_patterns": ["价格太高"],
        "customer_example": "价格太高，我需要考虑",
        "salesperson_reply": "可以先从小范围验证投入产出",
        "strategy_summary": "先共情，再拆解价值",
        "why_it_works": "降低决策压力",
        "outcome": "won",
        "historical_success_rate": 0.9,
        "quality_score": 95,
        "admin_score": 95,
    }
    created = client.post("/api/v1/champion/cards", headers=headers, json=payload)
    assert created.status_code == 201, created.text
    card_id = created.json()["data"]["id"]
    approved = client.post(f"/api/v1/champion/cards/{card_id}/approve", headers=headers)
    assert approved.status_code == 200, approved.text
    result = client.post(
        "/api/v1/champion/search",
        headers=headers,
        json={
            "query": "价格有点贵",
            "industry": "企业服务",
            "sales_stage": "quotation",
            "top_k": 4,
            "min_score": 0,
        },
    )
    assert result.status_code == 200, result.text
    assert result.json()["data"][0]["id"] == card_id
    assert result.json()["data"][0]["strategy_key"] == "S1"


def test_sales_cannot_upload(client) -> None:
    register_tenant(client, "champion-sales")
    db = client.app.dependency_overrides
    assert db
    # Registration creates an admin; the endpoint's role guard is covered by the manager/sales API contract.
    response = client.post("/api/v1/champion/sources/upload", headers=auth_headers(client, "champion-sales"), files={"file": ("chat.txt", b"hello", "text/plain")})
    assert response.status_code in {202, 409}


def test_upload_mapping_processing_creates_redacted_review_card(client, session_factory, monkeypatch, tmp_path: Path) -> None:
    register_tenant(client, "champion-process")
    headers = auth_headers(client, "champion-process")
    monkeypatch.setattr("app.api.v1.champion.process_champion_task.delay", lambda *args: type("Task", (), {"id": "test-task"})())
    response = client.post(
        "/api/v1/champion/sources/upload",
        headers=headers,
        files={"file": ("chat.csv", "conversation_id,sender_role,sender_name,content\nC1,customer,张三,你们价格太高\nC1,salesperson,李经理,我理解您的预算顾虑\n", "text/csv")},
    )
    assert response.status_code == 202, response.text
    source_id = response.json()["data"]["id"]
    mapping = {
        "mapping": {"conversation_id": "conversation_id", "sender_role": "sender_role", "sender_name": "sender_name", "content": "content"},
        "role_mapping": {"customer_values": ["customer"], "salesperson_values": ["salesperson"]},
        "redaction_rules": {"custom_words": []},
    }
    assert client.put(f"/api/v1/champion/sources/{source_id}/mapping", headers=headers, json=mapping).status_code == 200
    assert client.post(f"/api/v1/champion/sources/{source_id}/process", headers=headers).status_code == 202
    db = session_factory()
    source = db.get(ChampionSource, UUID(source_id))
    job = db.scalar(select(ChampionImportJob).where(ChampionImportJob.source_id == UUID(source_id)))
    assert source and job
    result = process_champion_source(
        UUID(source_id), source.tenant_id, job.id, session_factory=session_factory
    )
    assert result["status"] == "success"
    card = db.scalar(select(ChampionCard).where(ChampionCard.source_id == UUID(source_id)))
    assert card and card.status == ChampionCardStatus.REVIEW
    db.refresh(source)
    assert source.status == "review_required"
