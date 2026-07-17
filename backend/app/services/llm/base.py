from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from app.services.llm.schemas import (
    ChatMessage,
    ChatResult,
    ChatStreamEvent,
    GenerationSettings,
)


class ChatProvider(ABC):
    @abstractmethod
    async def generate(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> ChatResult: ...

    @abstractmethod
    async def stream(
        self, messages: list[ChatMessage], settings: GenerationSettings
    ) -> AsyncIterator[ChatStreamEvent]:
        if False:
            yield ChatStreamEvent(type="delta")
