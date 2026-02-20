from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    app_name: str = "Market War Radar API"
    environment: Literal["development", "staging", "production"] = "development"
    api_v1_prefix: str = "/api/v1"

    database_url: str
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

    @field_validator("cors_origins", "reddit_subreddits", "default_keywords", "default_industries", mode="before")
    @classmethod
    def parse_csv_list(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache

def get_settings() -> Settings:
    return Settings()


settings = get_settings()
