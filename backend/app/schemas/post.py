from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PostOut(BaseModel):
    id: UUID
    platform: str
    title: str
    content: str
    upvotes: int
    comments: int
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}
