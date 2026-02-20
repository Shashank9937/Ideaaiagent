import asyncio
import logging

from app.core.config import settings
from app.db.session import Base, engine
from app.models import admin_filter, cluster, idea, pain, post  # noqa: F401

logger = logging.getLogger(__name__)


def _is_auth_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    auth_markers = (
        "invalidpassworderror",
        "password authentication failed",
        "too many authentication errors",
        "circuit breaker open",
    )
    return any(marker in text for marker in auth_markers)


async def init_db() -> None:
    retries = max(1, settings.db_init_retries)
    delay_seconds = max(0.5, settings.db_init_retry_delay_seconds)
    last_error: Exception | None = None
    attempts_made = 0

    for attempt in range(1, retries + 1):
        attempts_made = attempt
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.warning("Database initialization succeeded on attempt %s/%s.", attempt, retries)
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc

            if _is_auth_error(exc):
                logger.error(
                    "Database authentication failed on attempt %s/%s. "
                    "Check SUPABASE_DATABASE_URL user/password (or DATABASE_PASSWORD override).",
                    attempt,
                    retries,
                )
                break

            logger.warning(
                "Database initialization attempt %s/%s failed: %s",
                attempt,
                retries,
                exc,
            )
            if attempt < retries:
                await asyncio.sleep(delay_seconds)

    message = f"Database initialization failed after {attempts_made}/{retries} attempts."
    if settings.fail_on_db_init_error:
        raise RuntimeError(message) from last_error

    logger.error("%s Continuing startup because FAIL_ON_DB_INIT_ERROR is false.", message)
