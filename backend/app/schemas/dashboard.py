from pydantic import BaseModel

from app.schemas.cluster import ProblemClusterOut
from app.schemas.idea import IdeaOut


class KpiTile(BaseModel):
    label: str
    value: str
    delta: str


class TrendSignal(BaseModel):
    cluster_id: str
    cluster_name: str
    trend_7d: int
    trend_30d: int


class RevenueModelSummary(BaseModel):
    revenue_model: str
    idea_count: int


class QuickLaunchPlan(BaseModel):
    title: str
    bullet_points: list[str]


class DashboardOverview(BaseModel):
    kpis: list[KpiTile]
    top_clusters: list[ProblemClusterOut]
    trending_signals: list[TrendSignal]
    top_ideas: list[IdeaOut]
    revenue_summary: list[RevenueModelSummary]
    quick_launch_plan: QuickLaunchPlan
