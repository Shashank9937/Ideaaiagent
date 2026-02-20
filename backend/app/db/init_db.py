from app.db.session import Base, engine
from app.models import admin_filter, cluster, idea, pain, post  # noqa: F401


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
