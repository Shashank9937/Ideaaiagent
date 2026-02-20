from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExtractedPainOut(BaseModel):
    id: UUID
    post_id: UUID
    pain_point: str
    target_user: str
    urgency_score: int = Field(ge=1, le=10)
    willingness_to_pay: int = Field(ge=1, le=10)
    existing_solutions: list[str]
    geo_scope: str
    industry: str
    created_at: datetime

    model_config = {"from_attributes": True}
