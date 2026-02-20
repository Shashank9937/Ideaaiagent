from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.idea import IdeaOut
from app.schemas.pain import ExtractedPainOut
from app.schemas.post import PostOut


class ProblemClusterOut(BaseModel):
    id: UUID
    name: str
    summary: str
    avg_urgency: float
    post_count: int
    trend_7d: int
    trend_30d: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClusterDetailOut(BaseModel):
    cluster: ProblemClusterOut
    pains: list[ExtractedPainOut]
    ideas: list[IdeaOut]
    posts: list[PostOut]
