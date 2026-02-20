from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.clusters import router as clusters_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.health import router as health_router
from app.api.routes.ideas import router as ideas_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(dashboard_router)
api_router.include_router(clusters_router)
api_router.include_router(ideas_router)
api_router.include_router(admin_router)
