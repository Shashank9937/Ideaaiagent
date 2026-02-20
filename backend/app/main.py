from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.db.init_db import init_db
from app.jobs.scheduler import scheduler_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await init_db()
    except Exception:  # noqa: BLE001
        logger.exception("Database bootstrap failed during startup; continuing service startup.")

    try:
        scheduler_manager.start()
    except Exception:  # noqa: BLE001
        logger.exception("Scheduler failed to start; continuing service startup.")

    try:
        yield
    finally:
        try:
            scheduler_manager.shutdown()
        except Exception:  # noqa: BLE001
            logger.exception("Scheduler shutdown encountered an error.")


app = FastAPI(
    title=settings.app_name,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
