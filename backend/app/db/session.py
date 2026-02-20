from collections.abc import AsyncGenerator

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _build_engine_config(raw_database_url: str) -> tuple[str, dict]:
    """
    Normalize DB URL query params and prepare asyncpg-specific connect args.
    This avoids prepared statement issues when using PgBouncer poolers.
    """
    parsed = make_url(raw_database_url)
    query = dict(parsed.query)
    connect_args: dict = {}

    statement_cache_value = query.pop("statement_cache_size", None)
    if statement_cache_value is None:
        statement_cache_value = query.pop("prepared_statement_cache_size", None)

    if statement_cache_value is not None:
        try:
            connect_args["statement_cache_size"] = int(statement_cache_value)
        except (TypeError, ValueError):
            connect_args["statement_cache_size"] = 0
    elif parsed.host and "pooler.supabase.com" in parsed.host:
        connect_args["statement_cache_size"] = 0

    normalized_url = str(parsed.set(query=query))
    return normalized_url, connect_args


normalized_database_url, engine_connect_args = _build_engine_config(settings.database_url)

engine = create_async_engine(
    normalized_database_url,
    connect_args=engine_connect_args,
    pool_pre_ping=True,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
