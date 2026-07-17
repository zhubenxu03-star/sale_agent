from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class GenerationSettings(BaseModel):
    temperature: float = Field(ge=0, le=2)
    max_output_tokens: int = Field(ge=1)
    json_schema: dict[str, Any] | None = None


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatResult(BaseModel):
    content: str
    model_name: str
    usage: TokenUsage = Field(default_factory=TokenUsage)


class ChatStreamEvent(BaseModel):
    type: Literal["delta", "done"]
    delta: str = ""
    result: ChatResult | None = None
