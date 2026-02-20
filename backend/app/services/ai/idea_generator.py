from typing import Any

from app.models.cluster import ProblemCluster
from app.models.pain import ExtractedPain
from app.services.ai.openai_client import run_json_completion


class IdeaGenerator:
    async def generate_for_cluster(self, cluster: ProblemCluster, pains: list[ExtractedPain]) -> list[dict[str, Any]]:
        top_pains = "\n".join([f"- {pain.pain_point}" for pain in pains[:8]])
        system_prompt = (
            "You are a startup ideation engine. Return strict JSON with key `ideas` as a list of exactly 5 items. "
            "Items 1-3 must have idea_type=saas. Item 4 must have idea_type=automation. "
            "Item 5 must have idea_type=enterprise. Each item must include: idea_type, idea_name, description, icp, "
            "revenue_model, mvp_features (array), pricing_estimate, execution_roadmap, tech_stack, gtm_strategy, launch_plan_30d."
        )
        user_prompt = (
            f"Cluster: {cluster.name}\nSummary: {cluster.summary}\n"
            f"Average urgency: {cluster.avg_urgency}\n"
            f"Pain examples:\n{top_pains}"
        )

        parsed = await run_json_completion(system_prompt, user_prompt)
        if parsed and isinstance(parsed.get("ideas"), list) and len(parsed["ideas"]) >= 5:
            return self._normalize(parsed["ideas"])[:5]

        return self._fallback(cluster)

    def _normalize(self, ideas: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for idx, raw in enumerate(ideas):
            idea_type = str(raw.get("idea_type") or self._default_type(idx)).lower()
            normalized.append(
                {
                    "idea_type": idea_type,
                    "idea_name": str(raw.get("idea_name") or "Untitled Idea").strip(),
                    "description": str(raw.get("description") or "").strip(),
                    "icp": str(raw.get("icp") or "SMBs").strip(),
                    "revenue_model": str(raw.get("revenue_model") or "Subscription").strip(),
                    "mvp_features": self._list_or_default(raw.get("mvp_features")),
                    "pricing_estimate": str(raw.get("pricing_estimate") or "$49-$299 / month").strip(),
                    "execution_roadmap": str(raw.get("execution_roadmap") or "").strip(),
                    "tech_stack": str(raw.get("tech_stack") or "").strip(),
                    "gtm_strategy": str(raw.get("gtm_strategy") or "").strip(),
                    "launch_plan_30d": str(raw.get("launch_plan_30d") or "").strip(),
                }
            )
        return normalized

    def _fallback(self, cluster: ProblemCluster) -> list[dict[str, Any]]:
        base_name = cluster.name.split(":")[0].strip() or "Ops"
        templates = [
            ("saas", f"{base_name} Copilot"),
            ("saas", f"{base_name} Workflow Hub"),
            ("saas", f"{base_name} Insights"),
            ("automation", f"{base_name} AI Bot Factory"),
            ("enterprise", f"{base_name} Command Center"),
        ]
        ideas: list[dict[str, Any]] = []
        for idea_type, idea_name in templates:
            ideas.append(
                {
                    "idea_type": idea_type,
                    "idea_name": idea_name,
                    "description": f"Build a {idea_type} product solving {cluster.name.lower()} pain.",
                    "icp": "Growth-stage startups and SMB operators",
                    "revenue_model": "Tiered subscription + usage overages",
                    "mvp_features": [
                        "Pain signal ingestion",
                        "AI recommendation engine",
                        "Action dashboard",
                    ],
                    "pricing_estimate": "$99-$799 / month",
                    "execution_roadmap": "Week 1 scoping, Week 2 build core, Week 3 pilots, Week 4 ship.",
                    "tech_stack": "Next.js, FastAPI, Postgres, OpenAI, Supabase Auth",
                    "gtm_strategy": "Founder-led outbound to communities where the pain was discovered.",
                    "launch_plan_30d": "Days 1-7 interviews; 8-15 MVP; 16-23 pilot; 24-30 paid beta.",
                }
            )
        return ideas

    @staticmethod
    def _default_type(idx: int) -> str:
        if idx <= 2:
            return "saas"
        if idx == 3:
            return "automation"
        return "enterprise"

    @staticmethod
    def _list_or_default(value: Any) -> list[str]:
        if isinstance(value, list):
            items = [str(item).strip() for item in value if str(item).strip()]
            if items:
                return items
        return ["Core workflow", "Dashboard", "Billing"]
