from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AdminFilterIn(BaseModel):
    include_keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    geo_scope: str = "GLOBAL"
    industries: list[str] = Field(default_factory=list)

    @field_validator("geo_scope")
    @classmethod
    def validate_geo_scope(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"INDIA", "GLOBAL"}:
            raise ValueError("geo_scope must be INDIA or GLOBAL")
        return normalized


class AdminFilterOut(BaseModel):
    id: int
    include_keywords: list[str]
    exclude_keywords: list[str]
    geo_scope: str
    industries: list[str]
    updated_at: datetime | None

    model_config = {"from_attributes": True}
