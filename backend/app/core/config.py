from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "sales-agent-api"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/sales_agent"
    jwt_secret_key: str = "replace-with-secure-key"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    cors_origins: str = "http://localhost:3000"
    app_env: str = "development"
    test_database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/sales_agent_test"
    )
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    knowledge_storage_path: str = str(BACKEND_DIR / "data" / "knowledge")
    knowledge_max_file_size_mb: int = 20
    knowledge_allowed_extensions: str = "pdf,docx,txt,md,xlsx,csv"
    knowledge_office_max_uncompressed_mb: int = 100
    knowledge_xlsx_max_rows: int = 50_000
    knowledge_xlsx_max_columns: int = 200
    knowledge_xlsx_max_cells: int = 200_000
    knowledge_csv_max_rows: int = 100_000
    chunk_target_size: int = 600
    chunk_overlap: int = 100
    chunk_min_size: int = 80
    embedding_provider: str = "test"
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = ""
    embedding_dimensions: int = 1536
    embedding_batch_size: int = 32
    embedding_timeout_seconds: int = 30
    llm_provider: str = "test"
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_timeout_seconds: int = 60
    llm_connect_timeout_seconds: int = 10
    llm_max_retries: int = 2
    llm_max_output_tokens: int = 1500
    llm_temperature: float = 0.3
    llm_stream_enabled: bool = True
    agent_history_message_limit: int = 12
    agent_retrieval_top_k: int = 6
    agent_retrieval_min_score: float = 0.35
    agent_max_knowledge_chars: int = 12_000
    agent_max_custom_instruction_chars: int = 4_000
    agent_request_timeout_seconds: int = 90
    agent_max_concurrent_requests_per_user: int = 2
    champion_storage_path: str = str(BACKEND_DIR / "data" / "champion")
    champion_max_file_size_mb: int = 20
    champion_allowed_extensions: str = "txt,md,csv,xlsx,json,docx"
    champion_session_gap_minutes: int = 1440
    champion_max_messages_per_conversation: int = 300
    champion_max_conversations_per_source: int = 10_000
    champion_extractor_provider: str = "test"
    champion_extraction_model: str = ""
    champion_extraction_timeout_seconds: int = 90
    champion_extraction_max_retries: int = 2
    champion_max_input_chars: int = 20_000
    champion_max_cards_per_conversation: int = 20
    champion_duplicate_score: float = 0.92
    champion_preview_records: int = 30

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def knowledge_extension_set(self) -> set[str]:
        return {
            item.strip().lower().lstrip(".")
            for item in self.knowledge_allowed_extensions.split(",")
            if item.strip()
        }

    @property
    def champion_extension_set(self) -> set[str]:
        return {
            item.strip().lower().lstrip(".")
            for item in self.champion_allowed_extensions.split(",")
            if item.strip()
        }

    @model_validator(mode="after")
    def validate_embedding_configuration(self) -> "Settings":
        if self.embedding_dimensions != 1536:
            raise ValueError("EMBEDDING_DIMENSIONS must be 1536 for the current vector schema")
        if self.app_env.lower() == "production":
            if self.embedding_provider == "test":
                raise ValueError("production cannot use the deterministic test embedding provider")
            if self.embedding_provider == "openai_compatible" and not all(
                [self.embedding_base_url, self.embedding_api_key, self.embedding_model]
            ):
                raise ValueError("production embedding service configuration is incomplete")
            if self.llm_provider == "test":
                raise ValueError("production cannot use the deterministic test chat provider")
            if self.llm_provider == "openai_compatible" and not all(
                [self.llm_base_url, self.llm_api_key, self.llm_model]
            ):
                raise ValueError("production LLM service configuration is incomplete")
            if self.champion_extractor_provider == "test":
                raise ValueError("production cannot use the deterministic champion extractor")
            if self.champion_extractor_provider == "llm" and not (
                self.champion_extraction_model or self.llm_model
            ):
                raise ValueError("production champion extraction model is not configured")
        if self.champion_extractor_provider not in {"test", "llm"}:
            raise ValueError("CHAMPION_EXTRACTOR_PROVIDER must be test or llm")
        if not 0 <= self.champion_duplicate_score <= 1:
            raise ValueError("CHAMPION_DUPLICATE_SCORE must be between 0 and 1")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
