from dataclasses import dataclass
from datetime import datetime


@dataclass(slots=True)
class RawPost:
    platform: str
    title: str
    content: str
    upvotes: int
    comments: int
    url: str
    created_at: datetime
