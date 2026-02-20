from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.services.collectors.base import RawPost


class TwitterCollector:
    endpoint = "https://api.twitter.com/2/tweets/search/recent"

    async def fetch(self, keywords: list[str], limit_per_keyword: int = 10) -> list[RawPost]:
        if not settings.twitter_bearer_token:
            return []

        headers = {"Authorization": f"Bearer {settings.twitter_bearer_token}"}
        results: list[RawPost] = []
        seen_ids: set[str] = set()

        async with httpx.AsyncClient(timeout=20) as client:
            for keyword in keywords:
                query = f'"{keyword}" lang:en -is:retweet'
                params = {
                    "query": query,
                    "max_results": min(limit_per_keyword, 100),
                    "tweet.fields": "created_at,public_metrics",
                }
                resp = await client.get(self.endpoint, headers=headers, params=params)
                if resp.status_code != 200:
                    continue

                data = resp.json().get("data", [])
                for item in data:
                    tweet_id = item.get("id")
                    if not tweet_id or tweet_id in seen_ids:
                        continue
                    seen_ids.add(tweet_id)

                    metrics = item.get("public_metrics", {})
                    created_at = item.get("created_at")
                    parsed_dt = (
                        datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                        if created_at
                        else datetime.now(timezone.utc)
                    )

                    results.append(
                        RawPost(
                            platform="twitter",
                            title=item.get("text", "")[:120],
                            content=item.get("text", ""),
                            upvotes=int(metrics.get("like_count", 0)),
                            comments=int(metrics.get("reply_count", 0)),
                            url=f"https://x.com/i/web/status/{tweet_id}",
                            created_at=parsed_dt,
                        )
                    )

        return results
