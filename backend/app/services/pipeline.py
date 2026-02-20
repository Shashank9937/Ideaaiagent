import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.admin_filter import AdminFilter
from app.models.cluster import ProblemCluster
from app.models.idea import Idea
from app.models.pain import ExtractedPain
from app.models.post import Post
from app.services.ai.idea_generator import IdeaGenerator
from app.services.ai.pain_extractor import PainExtractor
from app.services.ai.validation import ValidationScorer
from app.services.clustering.cluster_engine import ClusterEngine
from app.services.collectors.base import RawPost
from app.services.collectors.producthunt_collector import ProductHuntCollector
from app.services.collectors.reddit_collector import RedditCollector
from app.services.collectors.twitter_collector import TwitterCollector


class PipelineOrchestrator:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.reddit_collector = RedditCollector()
        self.producthunt_collector = ProductHuntCollector()
        self.twitter_collector = TwitterCollector()
        self.pain_extractor = PainExtractor()
        self.cluster_engine = ClusterEngine()
        self.idea_generator = IdeaGenerator()
        self.validation = ValidationScorer()

    async def run_full_pipeline(self) -> dict[str, int]:
        admin_filter = await self._get_or_create_filter()
        raw_posts = await self._collect_posts(admin_filter)
        created_posts = await self._persist_posts(raw_posts)
        extracted_count = await self._extract_pains(created_posts, admin_filter)
        clusters = await self.cluster_engine.cluster_unassigned_pains(self.db)
        await self._generate_ideas_for_clusters(clusters)
        await self.recalculate_cluster_trends()
        await self.db.commit()

        return {
            "collected_posts": len(raw_posts),
            "stored_posts": len(created_posts),
            "extracted_pains": extracted_count,
            "new_clusters": len(clusters),
        }

    async def recalculate_cluster_trends(self) -> None:
        await self.cluster_engine.refresh_cluster_rollups(self.db)
        clusters_result = await self.db.execute(select(ProblemCluster))
        clusters = list(clusters_result.scalars().all())

        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)
        thirty_days_ago = now - timedelta(days=30)

        for cluster in clusters:
            trend7 = await self.db.execute(
                select(func.count(ExtractedPain.id)).where(
                    and_(
                        ExtractedPain.cluster_id == cluster.id,
                        ExtractedPain.created_at >= seven_days_ago,
                    )
                )
            )
            trend30 = await self.db.execute(
                select(func.count(ExtractedPain.id)).where(
                    and_(
                        ExtractedPain.cluster_id == cluster.id,
                        ExtractedPain.created_at >= thirty_days_ago,
                    )
                )
            )
            cluster.trend_7d = int(trend7.scalar() or 0)
            cluster.trend_30d = int(trend30.scalar() or 0)

        await self.db.flush()

    async def _get_or_create_filter(self) -> AdminFilter:
        existing = await self.db.get(AdminFilter, 1)
        if existing:
            return existing

        default_filter = AdminFilter(
            id=1,
            include_keywords=settings.default_keywords,
            exclude_keywords=[],
            geo_scope=settings.default_geo_scope,
            industries=settings.default_industries,
        )
        self.db.add(default_filter)
        await self.db.flush()
        return default_filter

    async def _collect_posts(self, admin_filter: AdminFilter) -> list[RawPost]:
        keywords = admin_filter.include_keywords or settings.default_keywords

        reddit_task = asyncio.to_thread(self.reddit_collector.fetch, keywords, 30)
        producthunt_task = self.producthunt_collector.fetch(keywords, 30)
        twitter_task = self.twitter_collector.fetch(keywords, 15)

        reddit_posts, producthunt_posts, twitter_posts = await asyncio.gather(
            reddit_task,
            producthunt_task,
            twitter_task,
            return_exceptions=True,
        )

        combined: list[RawPost] = []
        for batch in (reddit_posts, producthunt_posts, twitter_posts):
            if isinstance(batch, Exception):
                continue
            combined.extend(batch)

        filtered = self._apply_manual_filters(combined, admin_filter)

        deduped_by_url: dict[str, RawPost] = {}
        for item in filtered:
            deduped_by_url[f"{item.platform}:{item.url}"] = item

        return list(deduped_by_url.values())

    def _apply_manual_filters(self, posts: list[RawPost], admin_filter: AdminFilter) -> list[RawPost]:
        exclude = [keyword.lower() for keyword in admin_filter.exclude_keywords]
        industries = [industry.lower() for industry in admin_filter.industries]

        filtered: list[RawPost] = []
        for post in posts:
            haystack = f"{post.title} {post.content}".lower()

            if exclude and any(keyword in haystack for keyword in exclude):
                continue

            if admin_filter.geo_scope == "INDIA":
                geo_tokens = ["india", "indian", "mumbai", "delhi", "bengaluru", "bangalore", "hyderabad"]
                if not any(token in haystack for token in geo_tokens):
                    continue

            if industries:
                if not any(industry in haystack for industry in industries):
                    continue

            filtered.append(post)

        return filtered

    async def _persist_posts(self, raw_posts: list[RawPost]) -> list[Post]:
        created_posts: list[Post] = []
        for raw in raw_posts:
            exists_query = await self.db.execute(
                select(Post.id).where(and_(Post.platform == raw.platform, Post.url == raw.url))
            )
            if exists_query.scalar_one_or_none() is not None:
                continue

            post = Post(
                platform=raw.platform,
                title=raw.title[:500],
                content=raw.content,
                upvotes=raw.upvotes,
                comments=raw.comments,
                url=raw.url,
                created_at=raw.created_at,
            )
            self.db.add(post)
            created_posts.append(post)

        await self.db.flush()
        return created_posts

    async def _extract_pains(self, posts: list[Post], admin_filter: AdminFilter) -> int:
        count = 0
        for post in posts:
            payload = await self.pain_extractor.extract(post)
            pain = ExtractedPain(
                post_id=post.id,
                pain_point=payload.pain_point,
                target_user=payload.target_user,
                urgency_score=payload.urgency_score,
                willingness_to_pay=payload.willingness_to_pay,
                existing_solutions=payload.existing_solutions,
                geo_scope=admin_filter.geo_scope,
                industry=(admin_filter.industries[0] if admin_filter.industries else "SaaS"),
            )
            self.db.add(pain)
            count += 1

        await self.db.flush()
        return count

    async def _generate_ideas_for_clusters(self, new_clusters: list[ProblemCluster]) -> None:
        if not new_clusters:
            return

        for cluster in new_clusters:
            pains_result = await self.db.execute(
                select(ExtractedPain).where(ExtractedPain.cluster_id == cluster.id).order_by(ExtractedPain.created_at.desc())
            )
            pains = list(pains_result.scalars().all())

            generated = await self.idea_generator.generate_for_cluster(cluster, pains)
            for item in generated:
                scoring = self.validation.score(cluster, item)
                idea = Idea(
                    cluster_id=cluster.id,
                    idea_type=item["idea_type"],
                    idea_name=item["idea_name"],
                    description=item["description"],
                    icp=item["icp"],
                    revenue_model=item["revenue_model"],
                    mvp_features=item["mvp_features"],
                    pricing_estimate=item["pricing_estimate"],
                    execution_roadmap=item["execution_roadmap"],
                    tech_stack=item["tech_stack"],
                    gtm_strategy=item["gtm_strategy"],
                    launch_plan_30d=item["launch_plan_30d"],
                    pain_intensity=int(scoring["pain_intensity"]),
                    frequency=int(scoring["frequency"]),
                    budget_size=int(scoring["budget_size"]),
                    competition_level=int(scoring["competition_level"]),
                    speed_to_mvp=int(scoring["speed_to_mvp"]),
                    scalability=int(scoring["scalability"]),
                    final_score=float(scoring["final_score"]),
                )
                self.db.add(idea)

        await self.db.flush()
