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
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
