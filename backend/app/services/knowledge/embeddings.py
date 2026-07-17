from __future__ import annotations

import hashlib
import math
import re
import time
from abc import ABC, abstractmethod

import httpx

from app.core.config import Settings, settings
from app.services.knowledge.errors import KnowledgeProcessingError


class EmbeddingProvider(ABC):
    name: str
    mode: str

    def __init__(self, dimensions: int) -> None:
        self.dimensions = dimensions

    @abstractmethod
    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def validate(self, texts: list[str], vectors: list[list[float]]) -> None:
        if len(vectors) != len(texts):
            raise KnowledgeProcessingError(
                "EMBEDDING_COUNT_MISMATCH", "Embedding服务返回的向量数量不正确"
            )
        if any(len(vector) != self.dimensions for vector in vectors):
            raise KnowledgeProcessingError(
                "EMBEDDING_DIMENSION_MISMATCH", "Embedding向量维度与数据库配置不一致"
            )


class DeterministicTestEmbeddingProvider(EmbeddingProvider):
    name = "deterministic_test"
    mode = "test"

    def _features(self, text: str) -> list[str]:
        normalized = re.sub(r"\s+", "", text.lower())
        chinese = [char for char in normalized if "\u4e00" <= char <= "\u9fff"]
        bigrams = ["".join(chinese[index : index + 2]) for index in range(len(chinese) - 1)]
        words = re.findall(r"[a-z0-9_\-]+", normalized)
        return chinese + bigrams + words or [normalized or "empty"]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * self.dimensions
            for feature in self._features(text):
                digest = hashlib.sha256(feature.encode("utf-8")).digest()
                index = int.from_bytes(digest[:4], "big") % self.dimensions
                sign = 1.0 if digest[4] % 2 == 0 else -1.0
                vector[index] += sign
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([value / norm for value in vector])
        self.validate(texts, vectors)
        return vectors


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    name = "openai_compatible"
    mode = "production"

    def __init__(self, config: Settings) -> None:
        super().__init__(config.embedding_dimensions)
        self.base_url = config.embedding_base_url.rstrip("/")
        self.api_key = config.embedding_api_key
        self.model = config.embedding_model
        self.timeout = config.embedding_timeout_seconds
        self.batch_size = config.embedding_batch_size

    def _request(self, texts: list[str]) -> list[list[float]]:
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(
                        f"{self.base_url}/embeddings",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json={
                            "model": self.model,
                            "input": texts,
                            "dimensions": self.dimensions,
                        },
                    )
                    response.raise_for_status()
                    data = response.json().get("data", [])
                    return [
                        item["embedding"] for item in sorted(data, key=lambda item: item["index"])
                    ]
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(0.25 * (2**attempt))
        raise KnowledgeProcessingError(
            "EMBEDDING_SERVICE_UNAVAILABLE", "Embedding服务暂时不可用，请稍后重试"
        ) from last_error

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for index in range(0, len(texts), self.batch_size):
            vectors.extend(self._request(texts[index : index + self.batch_size]))
        self.validate(texts, vectors)
        return vectors


def get_embedding_provider(config: Settings = settings) -> EmbeddingProvider:
    if config.embedding_provider == "test":
        if config.app_env.lower() == "production":
            raise RuntimeError("production cannot use test embeddings")
        return DeterministicTestEmbeddingProvider(config.embedding_dimensions)
    if config.embedding_provider == "openai_compatible":
        return OpenAICompatibleEmbeddingProvider(config)
    raise RuntimeError(f"unsupported embedding provider: {config.embedding_provider}")
