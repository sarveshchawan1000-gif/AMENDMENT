"""
Tests for stateless POST /court/compile and GET /court/health endpoints.
"""

from unittest.mock import patch, Mock
import pytest
from fastapi.testclient import TestClient

from backend.app import app, games


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


def test_court_health_endpoint(client):
    """GET /court/health returns provider and model status."""
    with patch("backend.app.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.model = "gemma3:4b"
        mock_provider.availability_detail.return_value = (
            True,
            True,
            "Model 'gemma3:4b' is ready.",
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/court/health")
        assert response.status_code == 200
        data = response.json()
        assert data["provider"] == "ollama"
        assert data["model"] == "gemma3:4b"
        assert data["ollama_reachable"] is True
        assert data["model_installed"] is True
        assert "ready" in data["message"].lower()


def test_court_health_endpoint_not_installed(client):
    """GET /court/health returns model missing message."""
    with patch("backend.app.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.model = "gemma3:4b"
        mock_provider.availability_detail.return_value = (
            True,
            False,
            "Model 'gemma3:4b' is not installed in Ollama. Run: ollama pull gemma3:4b",
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/court/health")
        assert response.status_code == 200
        data = response.json()
        assert data["ollama_reachable"] is True
        assert data["model_installed"] is False
        assert "ollama pull gemma3:4b" in data["message"]


def test_court_compile_stateless_does_not_modify_games(client):
    """POST /court/compile must be stateless and not create or modify games."""
    initial_game_count = len(games)

    mock_rule_json = (
        '{"trigger": "on_land", '
        '"condition": {"mode": "all", "predicates": []}, '
        '"effect": {"type": "add_score", "amount": 2, "target": "self"}}'
    )

    with patch("backend.court.compiler.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = mock_rule_json
        mock_get_provider.return_value = mock_provider

        response = client.post(
            "/court/compile",
            json={
                "text": "When you land, gain 2 points",
                "settings": {
                    "board_size": 6,
                    "dice_type": "1d6",
                    "win_target": 21,
                    "max_rules": 8,
                },
                "accepted_rules": [],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["accepted"] is True
        assert data["category"] == "accepted"
        assert data["rule"]["effect"]["amount"] == 2
        assert data["error"] is None

        # Verify no games were created
        assert len(games) == initial_game_count


def test_court_compile_not_a_game_rule(client):
    """POST /court/compile handles non-game-rule responses."""
    mock_response = '{"not_a_game_rule": true, "reason": "This is not a game rule."}'

    with patch("backend.court.compiler.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = mock_response
        mock_get_provider.return_value = mock_provider

        response = client.post(
            "/court/compile",
            json={"text": "hello how are you"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["accepted"] is False
        assert data["category"] == "not_a_game_rule"
        assert data["rule"] is None
        assert "not a game rule" in data["error"].lower()


def test_court_compile_out_of_range_amount(client):
    """POST /court/compile rejects out-of-range amounts via validator."""
    mock_response = (
        '{"trigger": "on_land", '
        '"condition": {"mode": "all", "predicates": []}, '
        '"effect": {"type": "add_score", "amount": 100, "target": "self"}}'
    )

    with patch("backend.court.compiler.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = mock_response
        mock_get_provider.return_value = mock_provider

        response = client.post(
            "/court/compile",
            json={"text": "Give me 100 points"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["accepted"] is False
        assert data["category"] == "invalid_rule"
        assert "cap" in data["error"].lower() or "5" in data["error"]
