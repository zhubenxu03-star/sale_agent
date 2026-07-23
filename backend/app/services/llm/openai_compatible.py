import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.llm.base import ChatProvider
from app.services.llm.errors import ChatProviderError, ChatProviderTimeout
from app.services.llm.schemas import (
    ChatMessage,
    ChatResult,
    ChatStreamEvent,
    GenerationSettings,
    TokenUsage,
)

RETRYABLE_STATUS = {429, 502, 503, 504}


class OpenAICompatibleChatProvider(ChatProvider):
    def __init__(self) -> None:
        self.config = get_settings()

    async def generate(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> ChatResult:
        payload = self._payload(messages, settings, stream=False, use_format=True)
        try:
            empty_attempt = 0
            while True:
                response = await self._post(payload)
                if response.status_code == 400 and "response_format" in payload:
                    payload.pop("response_format", None)
                    response = await self._post(payload)
                response.raise_for_status()
                body = response.json()
                try:
                    content = _extract_content(body)
                    break
                except ChatProviderError as exc:
                    if (
                        exc.code != "LLM_EMPTY_RESPONSE"
                        or empty_attempt >= self.config.llm_max_retries
                    ):
                        raise
                    await asyncio.sleep(0.25 * (2**empty_attempt))
                    empty_attempt += 1
        except httpx.TimeoutException as exc:
            raise ChatProviderTimeout() from exc
        except httpx.HTTPStatusError as exc:
            raise ChatProviderError(
                "大模型服务暂时不可用，请稍后重试",
                "LLM_UPSTREAM_ERROR",
                503 if exc.response.status_code in RETRYABLE_STATUS else 502,
            ) from exc
        usage = body.get("usage") or {}
        return ChatResult(
            content=content,
            model_name=body.get("model") or self.config.llm_model,
            usage=TokenUsage(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
                total_tokens=usage.get("total_tokens", 0),
            ),
        )

    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[ChatStreamEvent]:
        payload = self._payload(messages, settings, stream=True, use_format=True)
        chunks: list[str] = []
        timeout = self._timeout()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                attempt = 0
                while True:
                    async with client.stream(
                        "POST", self._url(), headers=self._headers(), json=payload
                    ) as response:
                        if response.status_code == 400 and "response_format" in payload:
                            await response.aread()
                            payload.pop("response_format", None)
                            continue
                        if (
                            response.status_code in RETRYABLE_STATUS
                            and attempt < self.config.llm_max_retries
                            and not chunks
                        ):
                            await response.aread()
                            await asyncio.sleep(0.25 * (2**attempt))
                            attempt += 1
                            continue
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            delta = _stream_delta(json.loads(data))
                            if delta:
                                chunks.append(delta)
                                yield ChatStreamEvent(type="delta", delta=delta)
                    if not chunks and attempt < self.config.llm_max_retries:
                        await asyncio.sleep(0.25 * (2**attempt))
                        attempt += 1
                        continue
                    break
        except httpx.TimeoutException as exc:
            raise ChatProviderTimeout() from exc
        except httpx.HTTPError as exc:
            raise ChatProviderError("大模型流式服务暂时不可用", "LLM_STREAM_ERROR", 503) from exc
        content = "".join(chunks).strip()
        if not content:
            raise ChatProviderError("大模型返回了空内容", "LLM_EMPTY_RESPONSE", 502)
        yield ChatStreamEvent(
            type="done",
            result=ChatResult(content=content, model_name=self.config.llm_model),
        )

    async def _post(self, payload: dict[str, Any]) -> httpx.Response:
        last: httpx.Response | None = None
        async with httpx.AsyncClient(timeout=self._timeout()) as client:
            for attempt in range(self.config.llm_max_retries + 1):
                last = await client.post(self._url(), headers=self._headers(), json=payload)
                if (
                    last.status_code not in RETRYABLE_STATUS
                    or attempt >= self.config.llm_max_retries
                ):
                    return last
                await asyncio.sleep(0.25 * (2**attempt))
        assert last is not None
        return last

    def _payload(
        self,
        messages: list[ChatMessage],
        settings: GenerationSettings,
        *,
        stream: bool,
        use_format: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.config.llm_model,
            "messages": [message.model_dump() for message in messages],
            "temperature": settings.temperature,
            "max_tokens": settings.max_output_tokens,
            "stream": stream,
        }
        if use_format and settings.json_schema:
            payload["response_format"] = {"type": "json_object"}
        return payload

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.config.llm_api_key}"}

    def _url(self) -> str:
        return f"{self.config.llm_base_url.rstrip('/')}/chat/completions"

    def _timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            self.config.llm_timeout_seconds,
            connect=self.config.llm_connect_timeout_seconds,
        )


def _extract_content(body: dict[str, Any]) -> str:
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ChatProviderError("大模型返回格式无效", "LLM_INVALID_RESPONSE", 502) from exc
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if not isinstance(content, str) or not content.strip():
        raise ChatProviderError("大模型返回了空内容", "LLM_EMPTY_RESPONSE", 502)
    return content.strip()


def _stream_delta(body: dict[str, Any]) -> str:
    try:
        return body["choices"][0]["delta"].get("content") or ""
    except (KeyError, IndexError, TypeError):
        return ""
