from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.jobs.tasks import run_scheduled_scrape, run_scheduled_trend_refresh


class SchedulerManager:
    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler(timezone="UTC")
        self._configured = False

    def start(self) -> None:
        if not self._configured:
            self.scheduler.add_job(
                run_scheduled_scrape,
                trigger=IntervalTrigger(hours=6),
                id="scrape_pipeline_6h",
                max_instances=1,
                coalesce=True,
            )
            self.scheduler.add_job(
                run_scheduled_trend_refresh,
                trigger=CronTrigger(hour=1, minute=0),
                id="cluster_trends_daily",
                max_instances=1,
                coalesce=True,
            )
            self._configured = True

        if not self.scheduler.running:
            self.scheduler.start()

    def shutdown(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)


scheduler_manager = SchedulerManager()
