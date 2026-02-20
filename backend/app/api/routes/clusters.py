from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.cluster import ProblemCluster
from app.models.idea import Idea
from app.models.pain import ExtractedPain
from app.models.post import Post
from app.schemas.cluster import ClusterDetailOut, ProblemClusterOut

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=list[ProblemClusterOut])
async def list_clusters(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[ProblemClusterOut]:
    result = await db.execute(select(ProblemCluster).order_by(ProblemCluster.post_count.desc()))
    return list(result.scalars().all())


@router.get("/{cluster_id}", response_model=ClusterDetailOut)
async def cluster_detail(
    cluster_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> ClusterDetailOut:
    cluster = await db.get(ProblemCluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    pains_result = await db.execute(
        select(ExtractedPain)
        .where(ExtractedPain.cluster_id == cluster_id)
        .order_by(ExtractedPain.urgency_score.desc(), ExtractedPain.created_at.desc())
    )
    pains = list(pains_result.scalars().all())

    posts_result = await db.execute(
        select(Post)
        .join(ExtractedPain, ExtractedPain.post_id == Post.id)
        .where(ExtractedPain.cluster_id == cluster_id)
        .order_by(Post.created_at.desc())
    )
    posts = list(posts_result.scalars().all())

    ideas_result = await db.execute(select(Idea).where(Idea.cluster_id == cluster_id).order_by(Idea.final_score.desc()))
    ideas = list(ideas_result.scalars().all())

    return ClusterDetailOut(cluster=cluster, pains=pains, ideas=ideas, posts=posts)
