from app.core.config import get_settings
from app.services.llm.base import ChatProvider
from app.services.llm.deterministic_test import DeterministicTestChatProvider
from app.services.llm.errors import ChatProviderError
from app.services.llm.openai_compatible import OpenAICompatibleChatProvider


def get_chat_provider() -> ChatProvider:
    provider = get_settings().llm_provider
    if provider == "test":
        return DeterministicTestChatProvider()
    if provider == "openai_compatible":
        return OpenAICompatibleChatProvider()
    raise ChatProviderError("大模型服务尚未配置", "LLM_NOT_CONFIGURED", 503)
