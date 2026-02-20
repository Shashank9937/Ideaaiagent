from collections.abc import AsyncGenerator
from urllib.parse import urlparse

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


def _extract_supabase_project_ref(supabase_url: str | None) -> str | None:
    if not supabase_url:
        return None
    parsed = urlparse(supabase_url)
    host = parsed.hostname or ""
    if not host.endswith(".supabase.co"):
        return None
    return host.split(".", 1)[0] or None


def _build_engine_config(raw_database_url: str) -> tuple[str, dict]:
    """
    Normalize DB URL query params and prepare asyncpg-specific connect args.
    This avoids prepared statement issues when using PgBouncer poolers.
    """
    parsed = make_url(raw_database_url)
    query = dict(parsed.query)
    connect_args: dict = {}
    is_supabase_pooler = bool(parsed.host and parsed.host.endswith("pooler.supabase.com"))

    # Allows plain-text password via env without manual URL encoding.
    if settings.database_password:
        parsed = parsed.set(password=settings.database_password)

    # Supabase pooler username must include the project ref.
    if is_supabase_pooler and parsed.username == "postgres":
        project_ref = _extract_supabase_project_ref(settings.supabase_url)
        if project_ref:
            parsed = parsed.set(username=f"postgres.{project_ref}")

    # Supabase pooler should use 6543 (5432 is for direct DB host).
    if is_supabase_pooler and parsed.port in (None, 5432):
        parsed = parsed.set(port=6543)

    # asyncpg expects `ssl`, not `sslmode`; normalize when needed.
    sslmode_value = query.pop("sslmode", None)
    if sslmode_value and "ssl" not in query:
        if str(sslmode_value).lower() in {"require", "verify-ca", "verify-full"}:
            query["ssl"] = "require"

    if is_supabase_pooler and "ssl" not in query:
        query["ssl"] = "require"

    statement_cache_value = query.pop("statement_cache_size", None)
    prepared_statement_cache_value = query.pop("prepared_statement_cache_size", None)
    if statement_cache_value is None:
        statement_cache_value = prepared_statement_cache_value

    if statement_cache_value is not None:
        try:
            connect_args["statement_cache_size"] = int(statement_cache_value)
        except (TypeError, ValueError):
            connect_args["statement_cache_size"] = 0
    elif is_supabase_pooler:
        connect_args["statement_cache_size"] = 0

    normalized_url = str(parsed.set(query=query))
    return normalized_url, connect_args


normalized_database_url, engine_connect_args = _build_engine_config(settings.database_url)

# Diagnostics
print("\n" + "!"*60, flush=True)
print("📢 DB CONNECTION DIAGNOSTICS", flush=True)
from sqlalchemy.engine.url import make_url
url_obj = make_url(normalized_database_url)
pass_val = url_obj.password or ""
pass_len = len(pass_val)
pass_preview = f"{pass_val[0]}...{pass_val[-1]}" if pass_len > 2 else "TOO SHORT"
print(f"Target: {url_obj.host}:{url_obj.port}", flush=True)
print(f"User: {url_obj.username}", flush=True)
print(f"Password Length: {pass_len}", flush=True)
print(f"Password Preview: {pass_preview}", flush=True)
if pass_val == "***":
    print("🚨 WARNING: Your password is set to '***'. Re-enter it in Render!", flush=True)
print("!"*60 + "\n", flush=True)

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
