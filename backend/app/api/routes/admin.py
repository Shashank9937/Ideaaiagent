from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.admin_filter import AdminFilter
from app.schemas.admin import AdminFilterIn, AdminFilterOut
from app.services.pipeline import PipelineOrchestrator

router = APIRouter(prefix="/admin", tags=["admin"])


async def _ensure_filter(db: AsyncSession) -> AdminFilter:
    current = await db.get(AdminFilter, 1)
    if current:
        return current

    current = AdminFilter(id=1, include_keywords=[], exclude_keywords=[], geo_scope="GLOBAL", industries=[])
    db.add(current)
    await db.flush()
    return current


@router.get("/filters", response_model=AdminFilterOut)
async def get_filters(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> AdminFilterOut:
    current = await _ensure_filter(db)
    return current


@router.put("/filters", response_model=AdminFilterOut)
async def update_filters(
    payload: AdminFilterIn,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> AdminFilterOut:
    current = await _ensure_filter(db)
    current.include_keywords = payload.include_keywords
    current.exclude_keywords = payload.exclude_keywords
    current.geo_scope = payload.geo_scope
    current.industries = payload.industries
    await db.commit()
    await db.refresh(current)
    return current


@router.post("/run-scrape")
async def trigger_scrape(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    orchestrator = PipelineOrchestrator(db)
    result = await orchestrator.run_full_pipeline()
    return {"status": "ok", "result": result}


@router.post("/recalculate-trends")
async def trigger_trends(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    orchestrator = PipelineOrchestrator(db)
    await orchestrator.recalculate_cluster_trends()
    await db.commit()
    return {"status": "ok"}
