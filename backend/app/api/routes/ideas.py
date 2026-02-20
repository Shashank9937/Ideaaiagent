from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.idea import Idea
from app.schemas.idea import IdeaOut

router = APIRouter(prefix="/ideas", tags=["ideas"])


@router.get("", response_model=list[IdeaOut])
async def list_ideas(
    limit: int = 25,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[IdeaOut]:
    result = await db.execute(select(Idea).order_by(Idea.final_score.desc()).limit(min(limit, 100)))
    return list(result.scalars().all())


@router.get("/{idea_id}", response_model=IdeaOut)
async def idea_detail(
    idea_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> IdeaOut:
    idea = await db.get(Idea, idea_id)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return idea
