"""
Tests for Health and Model-Status Endpoints.
Verifies that readiness reporting is truthful and does not fabricate 99.9% metrics.
"""
import pytest


def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("ok", "degraded")
    assert "version" in data
    assert "uptime_seconds" in data


def test_model_status_truthful(client):
    res = client.get("/api/v1/model-status")
    assert res.status_code == 200
    data = res.json()
    assert "services" in data
    services = {s["key"]: s for s in data["services"]}

    # Heuristic services must be labeled HEURISTIC or UNAVAILABLE
    assert services["deepfake_detector"]["status"] in ("HEURISTIC", "UNAVAILABLE")
    assert services["speaker_verification"]["status"] in ("HEURISTIC", "ONLINE", "UNAVAILABLE")
    assert services["replay_detector"]["status"] in ("HEURISTIC", "UNAVAILABLE")
    assert services["backend"]["status"] == "ONLINE"
