from app.services.knowledge.embeddings import EmbeddingProvider, get_embedding_provider


def embed_card(text: str, provider: EmbeddingProvider | None = None) -> list[float]:
    embedding_provider = provider or get_embedding_provider()
    return embedding_provider.embed_texts([text])[0]
