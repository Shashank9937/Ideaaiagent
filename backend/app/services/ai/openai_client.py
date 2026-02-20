import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import settings


_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI | None:
    global _client
    if not settings.openai_api_key:
        return None
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def run_json_completion(system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    client = get_openai_client()
    if client is None:
        return None

    try:
        completion = await client.chat.completions.create(
            model=settings.openai_model,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = completion.choices[0].message.content or "{}"
        return json.loads(content)
    except Exception:
        return None
