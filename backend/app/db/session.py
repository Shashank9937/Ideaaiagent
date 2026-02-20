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
    
    # Explicitly enforce SSL and disable statement cache for Supabase connections
    is_supabase = parsed.host and ("supabase.com" in parsed.host or "supabase.co" in parsed.host)
    if is_supabase:
        connect_args["ssl"] = "require"
        # Always disable statement cache for any Supabase/Pooler connection to stay safe
        connect_args["statement_cache_size"] = 0
        
    return normalized_url, connect_args


normalized_database_url, engine_connect_args = _build_engine_config(settings.database_url)

# Debug: Print the URL being used (masking password)
try:
    from sqlalchemy.engine.url import make_url
    debug_url = make_url(normalized_database_url)
    user_info = f"{debug_url.username}"
    if debug_url.password:
        user_info += ":***"
    
    print(f"DEBUG - Attempting connection to: {debug_url.host}:{debug_url.port or 5432}/{debug_url.database}", flush=True)
    print(f"DEBUG - User: {debug_url.username}", flush=True)
    print(f"DEBUG - SSL Config: {engine_connect_args.get('ssl')}", flush=True)
    print(f"DEBUG - Statement Cache Size: {engine_connect_args.get('statement_cache_size')}", flush=True)
    print(f"DEBUG - Final URL Host: {debug_url.host}", flush=True)
except Exception as e:
    print(f"DEBUG - Error inspecting URL: {e}", flush=True)

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
