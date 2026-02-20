import asyncio
import logging

from app.core.config import settings
from app.db.session import Base, engine
from app.models import admin_filter, cluster, idea, pain, post  # noqa: F401

logger = logging.getLogger(__name__)


async def init_db() -> None:
    retries = max(1, settings.db_init_retries)
    delay_seconds = max(0.5, settings.db_init_retry_delay_seconds)
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.warning("Database initialization succeeded on attempt %s/%s.", attempt, retries)
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.exception("Database initialization attempt %s/%s failed.", attempt, retries)
            if attempt < retries:
                await asyncio.sleep(delay_seconds)

    message = f"Database initialization failed after {retries} attempts."
    if settings.fail_on_db_init_error:
        raise RuntimeError(message) from last_error

    logger.error("%s Continuing startup because FAIL_ON_DB_INIT_ERROR is false.", message)
