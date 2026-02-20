from collections import Counter, defaultdict

from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import ProblemCluster
from app.models.pain import ExtractedPain


class ClusterEngine:
    """Groups similar pains into reusable problem clusters."""

    async def cluster_unassigned_pains(self, db: AsyncSession) -> list[ProblemCluster]:
        result = await db.execute(select(ExtractedPain).where(ExtractedPain.cluster_id.is_(None)))
        pains = list(result.scalars().all())
        if not pains:
            return []

        groups = self._build_groups(pains)
        created_clusters: list[ProblemCluster] = []

        for group in groups:
            if not group:
                continue

            avg_urgency = sum(pain.urgency_score for pain in group) / len(group)
            cluster_name, cluster_summary = self._summarize_group(group)

            cluster = ProblemCluster(
                name=cluster_name,
                summary=cluster_summary,
                avg_urgency=round(avg_urgency, 2),
                post_count=len(group),
            )
            db.add(cluster)
            await db.flush()

            for pain in group:
                pain.cluster_id = cluster.id

            created_clusters.append(cluster)

        await db.flush()
        return created_clusters

    def _build_groups(self, pains: list[ExtractedPain]) -> list[list[ExtractedPain]]:
        if len(pains) == 1:
            return [pains]

        texts = [pain.pain_point for pain in pains]
        vectorizer = TfidfVectorizer(stop_words="english", max_features=600)
        matrix = vectorizer.fit_transform(texts)

        try:
            clusterer = AgglomerativeClustering(
                n_clusters=None,
                metric="cosine",
                linkage="average",
                distance_threshold=0.65,
            )
            labels = clusterer.fit_predict(matrix.toarray())
        except Exception:
            labels = list(range(len(pains)))

        grouped: dict[int, list[ExtractedPain]] = defaultdict(list)
        for idx, label in enumerate(labels):
            grouped[int(label)].append(pains[idx])

        return list(grouped.values())

    def _summarize_group(self, group: list[ExtractedPain]) -> tuple[str, str]:
        token_counter: Counter[str] = Counter()
        for pain in group:
            tokens = [
                token.lower().strip(".,!?:;()[]{}\"'`) ")
                for token in pain.pain_point.split()
                if len(token) > 3
            ]
            token_counter.update(token for token in tokens if token.isascii())

        top_tokens = [token for token, _ in token_counter.most_common(3)] or ["operations"]
        cluster_name = " / ".join(token.title() for token in top_tokens)
        summary = (
            f"Cluster built from {len(group)} pain signals around "
            f"{', '.join(top_tokens)} with urgency focus."
        )
        return cluster_name, summary

    async def refresh_cluster_rollups(self, db: AsyncSession) -> None:
        result = await db.execute(select(ProblemCluster))
        clusters = list(result.scalars().all())

        for cluster in clusters:
            pain_stats = await db.execute(
                select(func.count(ExtractedPain.id), func.avg(ExtractedPain.urgency_score)).where(
                    ExtractedPain.cluster_id == cluster.id
                )
            )
            count, avg_urgency = pain_stats.one()
            cluster.post_count = int(count or 0)
            cluster.avg_urgency = float(round(avg_urgency or 0.0, 2))
