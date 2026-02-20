from app.db.session import AsyncSessionLocal
from app.services.pipeline import PipelineOrchestrator


async def run_scheduled_scrape() -> None:
    async with AsyncSessionLocal() as db:
        orchestrator = PipelineOrchestrator(db)
        await orchestrator.run_full_pipeline()


async def run_scheduled_trend_refresh() -> None:
    async with AsyncSessionLocal() as db:
        orchestrator = PipelineOrchestrator(db)
        await orchestrator.recalculate_cluster_trends()
        await db.commit()
