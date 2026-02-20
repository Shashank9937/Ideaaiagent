from app.models.cluster import ProblemCluster
from app.services.ai.validation import ValidationScorer


def test_validation_score_range() -> None:
    scorer = ValidationScorer()
    cluster = ProblemCluster(name="Ops", summary="", avg_urgency=8.0, post_count=12)
    idea = {
        "revenue_model": "Tiered subscription + usage",
        "icp": "B2B operations teams",
        "description": "Workflow dashboard with automation",
        "mvp_features": ["Ingestion", "Insights", "Automation"],
    }

    score = scorer.score(cluster, idea)
    assert 0 <= score["final_score"] <= 100
