import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ProblemCluster(Base):
    __tablename__ = "problem_clusters"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    avg_urgency: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    post_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trend_7d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trend_30d: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    pains = relationship("ExtractedPain", back_populates="cluster")
    ideas = relationship("Idea", back_populates="cluster", cascade="all, delete-orphan")
