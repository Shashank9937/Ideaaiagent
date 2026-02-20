from datetime import datetime, timezone

import praw

from app.core.config import settings
from app.services.collectors.base import RawPost


class RedditCollector:
    """Collects discussions from target subreddits via PRAW."""

    def __init__(self) -> None:
        self.is_enabled = bool(settings.reddit_client_id and settings.reddit_client_secret)
        self.client = None
        if self.is_enabled:
            self.client = praw.Reddit(
                client_id=settings.reddit_client_id,
                client_secret=settings.reddit_client_secret,
                user_agent=settings.reddit_user_agent,
            )

    def fetch(self, keywords: list[str], limit_per_keyword: int = 25) -> list[RawPost]:
        if not self.client:
            return []

        subreddits = "+".join(settings.reddit_subreddits)
        subreddit = self.client.subreddit(subreddits)

        seen_urls: set[str] = set()
        results: list[RawPost] = []

        for keyword in keywords:
            for submission in subreddit.search(keyword, sort="new", limit=limit_per_keyword):
                if submission.url in seen_urls:
                    continue

                seen_urls.add(submission.url)
                body = submission.selftext or submission.title
                results.append(
                    RawPost(
                        platform="reddit",
                        title=submission.title,
                        content=body,
                        upvotes=max(submission.score, 0),
                        comments=max(submission.num_comments, 0),
                        url=submission.url,
                        created_at=datetime.fromtimestamp(submission.created_utc, tz=timezone.utc),
                    )
                )

        return results
