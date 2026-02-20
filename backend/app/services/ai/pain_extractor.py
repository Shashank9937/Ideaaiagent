from dataclasses import dataclass
from typing import Any

from app.models.post import Post
from app.services.ai.openai_client import run_json_completion


@dataclass(slots=True)
class PainExtractionPayload:
    pain_point: str
    target_user: str
    urgency_score: int
    willingness_to_pay: int
    existing_solutions: list[str]


class PainExtractor:
    async def extract(self, post: Post) -> PainExtractionPayload:
        system_prompt = (
            "You are an analyst that extracts startup pain signals from social discussions. "
            "Return strict JSON with keys: pain_point, target_user, urgency_score, "
            "willingness_to_pay, existing_solutions. urgency_score and willingness_to_pay are integers 1-10."
        )
        user_prompt = (
            f"Platform: {post.platform}\n"
            f"Title: {post.title}\n"
            f"Content: {post.content}\n"
            f"Upvotes: {post.upvotes}\nComments: {post.comments}"
        )

        parsed = await run_json_completion(system_prompt, user_prompt)
        if parsed is None:
            return self._fallback(post)

        return self._normalize(parsed, post)

    def _normalize(self, parsed: dict[str, Any], post: Post) -> PainExtractionPayload:
        pain_point = str(parsed.get("pain_point") or post.title[:220]).strip()
        target_user = str(parsed.get("target_user") or "SMB operators").strip()
        urgency = self._bounded_int(parsed.get("urgency_score"), self._estimate_urgency(post), 1, 10)
        wtp = self._bounded_int(parsed.get("willingness_to_pay"), self._estimate_wtp(post), 1, 10)

        raw_solutions = parsed.get("existing_solutions")
        if isinstance(raw_solutions, list):
            solutions = [str(item).strip() for item in raw_solutions if str(item).strip()]
        else:
            solutions = ["Manual workflows", "Spreadsheets", "Generic SaaS tools"]

        return PainExtractionPayload(
            pain_point=pain_point,
            target_user=target_user,
            urgency_score=urgency,
            willingness_to_pay=wtp,
            existing_solutions=solutions,
        )

    def _fallback(self, post: Post) -> PainExtractionPayload:
        return PainExtractionPayload(
            pain_point=post.title[:240],
            target_user="Startup operators and growth teams",
            urgency_score=self._estimate_urgency(post),
            willingness_to_pay=self._estimate_wtp(post),
            existing_solutions=["Manual process", "Hiring contractors", "Fragmented tools"],
        )

    @staticmethod
    def _bounded_int(value: Any, fallback: int, min_value: int, max_value: int) -> int:
        try:
            parsed = int(value)
            return max(min(parsed, max_value), min_value)
        except (TypeError, ValueError):
            return fallback

    @staticmethod
    def _estimate_urgency(post: Post) -> int:
        score = 3
        if post.upvotes > 20:
            score += 2
        if post.comments > 10:
            score += 2
        if any(token in post.content.lower() for token in ["urgent", "need", "stuck", "pain", "blocked"]):
            score += 2
        return max(1, min(score, 10))

    @staticmethod
    def _estimate_wtp(post: Post) -> int:
        score = 4
        lower_content = post.content.lower()
        if any(token in lower_content for token in ["pay", "budget", "expensive", "cost"]):
            score += 2
        if any(token in lower_content for token in ["enterprise", "b2b", "client"]):
            score += 2
        return max(1, min(score, 10))
