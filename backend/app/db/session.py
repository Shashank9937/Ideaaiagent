from collections.abc import AsyncGenerator
import logging
from urllib.parse import urlparse

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)


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


def _is_placeholder_password(value: str | None) -> bool:
    if value is None:
        return False
    password = value.strip()
    if not password:
        return True
    lowered = password.lower()
    if set(password) == {"*"}:
        return True
    if set(lowered) == {"x"}:
        return True
    placeholders = {
        "password",
        "your_password",
        "your-password",
        "<your_password>",
        "[your-password]",
        "changeme",
        "temp_password",
    }
    return lowered in placeholders


def _normalize_password(value: str | None) -> str | None:
    if value is None:
        return None
    password = value.strip()
    if len(password) >= 2 and password[0] == password[-1] and password[0] in {"'", '"'}:
        password = password[1:-1].strip()
    return password or None


def _build_engine_config(raw_database_url: str) -> tuple[str, dict]:
    """
    Normalize DB URL query params and prepare asyncpg-specific connect args.
    This avoids prepared statement issues when using PgBouncer poolers.
    """
    parsed = make_url(raw_database_url)
    query = dict(parsed.query)
    connect_args: dict = {}
    is_supabase_pooler = bool(parsed.host and parsed.host.endswith("pooler.supabase.com"))

    # Prefer password already embedded in SUPABASE_DATABASE_URL.
    url_password = _normalize_password(parsed.password)
    env_password = _normalize_password(settings.database_password)

    if url_password and not _is_placeholder_password(url_password):
        if env_password and not _is_placeholder_password(env_password) and env_password != url_password:
            logger.warning(
                "Ignoring DATABASE_PASSWORD because SUPABASE_DATABASE_URL already contains a different password."
            )
    elif env_password and not _is_placeholder_password(env_password):
        # Allows plain-text password via env without manual URL encoding.
        parsed = parsed.set(password=env_password)
    elif env_password and _is_placeholder_password(env_password):
        logger.warning("Ignoring placeholder DATABASE_PASSWORD value; using password from SUPABASE_DATABASE_URL.")

    final_password = _normalize_password(parsed.password)
    if not final_password or _is_placeholder_password(final_password):
        logger.error(
            "No valid database password configured. "
            "Set SUPABASE_DATABASE_URL with real password or DATABASE_PASSWORD in Render."
        )

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
