from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CloudVault"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    secret_key: str = Field(default="change-me-in-production", min_length=16)
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    database_url: str = "postgresql+psycopg://cloudvault:cloudvault@postgres:5432/cloudvault"
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "amqp://guest:guest@rabbitmq:5672//"

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "cloudvault"
    minio_secret_key: str = "cloudvault-secret"
    minio_bucket: str = "cloudvault"
    minio_secure: bool = False

    elasticsearch_url: str = "http://elasticsearch:9200"
    elasticsearch_index: str = "cloudvault-files"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    max_upload_mb: int = 1536
    default_storage_quota_mb: int = 2048

    otel_service_name: str = "cloudvault-api"
    otel_exporter_otlp_endpoint: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
