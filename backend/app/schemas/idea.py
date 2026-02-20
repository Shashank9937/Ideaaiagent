from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class IdeaOut(BaseModel):
    id: UUID
    cluster_id: UUID
    idea_type: str
    idea_name: str
    description: str
    icp: str
    revenue_model: str
    mvp_features: list[str]
    pricing_estimate: str
    pain_intensity: int
    frequency: int
    budget_size: int
    competition_level: int
    speed_to_mvp: int
    scalability: int
    final_score: float
    execution_roadmap: str
    tech_stack: str
    gtm_strategy: str
    launch_plan_30d: str
    created_at: datetime

    model_config = {"from_attributes": True}
