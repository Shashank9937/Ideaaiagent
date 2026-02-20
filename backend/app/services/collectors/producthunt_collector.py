from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.services.collectors.base import RawPost


class ProductHuntCollector:
    endpoint = "https://api.producthunt.com/v2/api/graphql"

    async def fetch(self, keywords: list[str], limit: int = 20) -> list[RawPost]:
        if not settings.producthunt_access_token:
            return []

        query = """
        query FeedPosts($first: Int!) {
          posts(first: $first, order: VOTES) {
            edges {
              node {
                name
                tagline
                description
                votesCount
                commentsCount
                url
                createdAt
              }
            }
          }
        }
        """

        headers = {
            "Authorization": f"Bearer {settings.producthunt_access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(self.endpoint, json={"query": query, "variables": {"first": limit}}, headers=headers)
            resp.raise_for_status()
            payload = resp.json()

        edges = payload.get("data", {}).get("posts", {}).get("edges", [])

        results: list[RawPost] = []
        lowered_keywords = [k.lower() for k in keywords]

        for edge in edges:
            node = edge.get("node", {})
            title = node.get("name", "")
            tagline = node.get("tagline", "")
            description = node.get("description", "")
            combined = " ".join([title, tagline, description]).lower()

            if lowered_keywords and not any(k in combined for k in lowered_keywords):
                continue

            created_at = node.get("createdAt")
            parsed_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00")) if created_at else datetime.now(timezone.utc)

            results.append(
                RawPost(
                    platform="producthunt",
                    title=title,
                    content=f"{tagline}\n\n{description}".strip(),
                    upvotes=int(node.get("votesCount", 0)),
                    comments=int(node.get("commentsCount", 0)),
                    url=node.get("url", ""),
                    created_at=parsed_dt,
                )
            )

        return results
