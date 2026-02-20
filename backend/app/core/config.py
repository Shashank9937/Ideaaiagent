import logging
import os
from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    app_name: str = "Market War Radar API"
    environment: Literal["development", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        validation_alias=AliasChoices(
            "SUPABASE_DATABASE_URL",
            "database_url",
        )
    )
    cors_origins: list[str] = ["http://localhost:3000"]

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    reddit_client_id: str | None = None
    reddit_client_secret: str | None = None
    reddit_user_agent: str = "market-war-radar/1.0"
    reddit_subreddits: list[str] = [
        "startups",
        "Entrepreneur",
        "SaaS",
        "smallbusiness",
        "ArtificialInteligence",
    ]

    producthunt_access_token: str | None = None
    twitter_bearer_token: str | None = None

    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_jwt_secret: str | None = None
    allow_anon_read: bool = True

    default_keywords: list[str] = [
        "churn",
        "bottleneck",
        "manual process",
        "costly",
        "repetitive",
    ]
    default_geo_scope: str = "GLOBAL"
    default_industries: list[str] = ["SaaS", "AI", "B2B"]
    db_init_retries: int = 10
    db_init_retry_delay_seconds: float = 3.0
    fail_on_db_init_error: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str | None) -> str:
        if value is None or not str(value).strip():
            raise ValueError("SUPABASE_DATABASE_URL is required")

        url = str(value).strip()
        if url.startswith("postgresql+asyncpg://"):
            return url
        if url.startswith("postgres://"):
            return "postgresql+asyncpg://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url[len("postgresql://") :]
        if url.startswith("postgresql+psycopg://"):
            return "postgresql+asyncpg://" + url[len("postgresql+psycopg://") :]
        if url.startswith("postgresql+psycopg2://"):
            return "postgresql+asyncpg://" + url[len("postgresql+psycopg2://") :]
        return url

    @field_validator("cors_origins", "reddit_subreddits", "default_keywords", "default_industries", mode="before")
    @classmethod
    def parse_csv_list(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache

def get_settings() -> Settings:
    supabase_override = os.getenv("SUPABASE_DATABASE_URL", "").strip()
    loaded = Settings(database_url=supabase_override) if supabase_override else Settings()

    parsed = urlparse(loaded.database_url)
    logger.warning(
        "Database target resolved: user=%s host=%s port=%s",
        parsed.username,
        parsed.hostname,
        parsed.port,
    )
    return loaded


settings = get_settings()
