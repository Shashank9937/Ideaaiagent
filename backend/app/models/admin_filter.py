from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AdminFilter(Base):
    __tablename__ = "admin_filters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    include_keywords: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    exclude_keywords: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    geo_scope: Mapped[str] = mapped_column(String(16), default="GLOBAL", nullable=False)
    industries: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
