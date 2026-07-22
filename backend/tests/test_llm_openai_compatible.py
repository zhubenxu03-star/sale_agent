import asyncio

import httpx

from app.services.llm.openai_compatible import OpenAICompatibleChatProvider
from app.services.llm.schemas import ChatMessage, GenerationSettings


def test_deepseek_json_output_uses_json_object() -> None:
    provider = OpenAICompatibleChatProvider()

    payload = provider._payload(
        [ChatMessage(role="user", content="请输出 JSON")],
        GenerationSettings(
            temperature=0.1,
            max_output_tokens=512,
            json_schema={"type": "object"},
        ),
        stream=False,
        use_format=True,
    )

    assert payload["response_format"] == {"type": "json_object"}


def test_empty_content_is_retried(monkeypatch) -> None:
    provider = OpenAICompatibleChatProvider()
    provider.config.llm_max_retries = 1
    request = httpx.Request("POST", "https://example.invalid/chat/completions")
    responses = iter(
        [
            httpx.Response(
                200,
                request=request,
                json={"choices": [{"message": {"content": ""}}]},
            ),
            httpx.Response(
                200,
                request=request,
                json={
                    "model": "deepseek-v4-flash",
                    "choices": [{"message": {"content": '{"reply_text":"ok"}'}}],
                    "usage": {"total_tokens": 10},
                },
            ),
        ]
    )
    calls = 0

    async def fake_post(_payload):
        nonlocal calls
        calls += 1
        return next(responses)

    async def no_sleep(_seconds):
        return None

    monkeypatch.setattr(provider, "_post", fake_post)
    monkeypatch.setattr("app.services.llm.openai_compatible.asyncio.sleep", no_sleep)

    result = asyncio.run(
        provider.generate(
            [ChatMessage(role="user", content="请输出 JSON")],
            GenerationSettings(
                temperature=0.1,
                max_output_tokens=512,
                json_schema={"type": "object"},
            ),
        )
    )

    assert calls == 2
    assert result.content == '{"reply_text":"ok"}'
    assert result.usage.total_tokens == 10
