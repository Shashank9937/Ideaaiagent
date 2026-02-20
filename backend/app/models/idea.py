import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Idea(Base):
    __tablename__ = "ideas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("problem_clusters.id", ondelete="CASCADE"))

    idea_type: Mapped[str] = mapped_column(String(32), nullable=False)
    idea_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icp: Mapped[str] = mapped_column(String(255), nullable=False)
    revenue_model: Mapped[str] = mapped_column(String(255), nullable=False)
    mvp_features: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    pricing_estimate: Mapped[str] = mapped_column(String(255), nullable=False)

    pain_intensity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    frequency: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    budget_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    competition_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    speed_to_mvp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scalability: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    final_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    execution_roadmap: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tech_stack: Mapped[str] = mapped_column(Text, default="", nullable=False)
    gtm_strategy: Mapped[str] = mapped_column(Text, default="", nullable=False)
    launch_plan_30d: Mapped[str] = mapped_column(Text, default="", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    cluster = relationship("ProblemCluster", back_populates="ideas")
