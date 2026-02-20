import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ExtractedPain(Base):
    __tablename__ = "extracted_pains"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    cluster_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("problem_clusters.id", ondelete="SET NULL"),
        nullable=True,
    )
    pain_point: Mapped[str] = mapped_column(Text, nullable=False)
    target_user: Mapped[str] = mapped_column(String(255), nullable=False)
    urgency_score: Mapped[int] = mapped_column(Integer, nullable=False)
    willingness_to_pay: Mapped[int] = mapped_column(Integer, nullable=False)
    existing_solutions: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    geo_scope: Mapped[str] = mapped_column(String(16), default="GLOBAL", nullable=False)
    industry: Mapped[str] = mapped_column(String(32), default="SaaS", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    post = relationship("Post", back_populates="extracted_pain")
    cluster = relationship("ProblemCluster", back_populates="pains")
