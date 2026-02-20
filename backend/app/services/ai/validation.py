from app.models.cluster import ProblemCluster


class ValidationScorer:
    """Scores startup ideas with weighted validation criteria."""

    weights = {
        "pain_intensity": 0.25,
        "frequency": 0.20,
        "budget_size": 0.15,
        "competition_level": 0.10,
        "speed_to_mvp": 0.15,
        "scalability": 0.15,
    }

    def score(self, cluster: ProblemCluster, idea: dict) -> dict[str, int | float]:
        pain_intensity = int(max(0, min(cluster.avg_urgency * 10, 100)))
        frequency = int(max(0, min(cluster.post_count * 8, 100)))
        budget_size = self._score_budget(idea)
        competition_level = self._score_competition(idea)
        speed_to_mvp = self._score_speed(idea)
        scalability = self._score_scalability(idea)

        weighted = (
            pain_intensity * self.weights["pain_intensity"]
            + frequency * self.weights["frequency"]
            + budget_size * self.weights["budget_size"]
            + (100 - competition_level) * self.weights["competition_level"]
            + speed_to_mvp * self.weights["speed_to_mvp"]
            + scalability * self.weights["scalability"]
        )

        return {
            "pain_intensity": pain_intensity,
            "frequency": frequency,
            "budget_size": budget_size,
            "competition_level": competition_level,
            "speed_to_mvp": speed_to_mvp,
            "scalability": scalability,
            "final_score": round(weighted, 2),
        }

    def _score_budget(self, idea: dict) -> int:
        revenue = str(idea.get("revenue_model", "")).lower()
        icp = str(idea.get("icp", "")).lower()
        score = 50
        if any(token in revenue for token in ["enterprise", "annual", "seat", "usage"]):
            score += 20
        if any(token in icp for token in ["enterprise", "mid-market", "b2b"]):
            score += 15
        return max(0, min(score, 100))

    def _score_competition(self, idea: dict) -> int:
        description = str(idea.get("description", "")).lower()
        if "category-defining" in description or "new" in description:
            return 35
        if "workflow" in description or "dashboard" in description:
            return 60
        return 50

    def _score_speed(self, idea: dict) -> int:
        features = [item.lower() for item in idea.get("mvp_features", [])]
        score = 80
        if len(features) > 6:
            score -= 20
        if any("integrations" in item for item in features):
            score -= 10
        return max(0, min(score, 100))

    def _score_scalability(self, idea: dict) -> int:
        revenue = str(idea.get("revenue_model", "")).lower()
        score = 65
        if any(token in revenue for token in ["usage", "api", "platform"]):
            score += 20
        if "services" in revenue:
            score -= 10
        return max(0, min(score, 100))
