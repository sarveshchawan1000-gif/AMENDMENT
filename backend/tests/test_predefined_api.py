"""
Integration tests for the predefined amendment system endpoints.
"""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.app import app, games


@pytest.fixture(autouse=True)
def reset_games():
    """Clear in-memory games storage before and after each test."""
    games.clear()
    yield
    games.clear()


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def active_game(client):
    """Create a standard 2-player active game."""
    request_data = {
        "settings": {
            "board_size": 10,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8,
            "amend_every": None,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    assert response.status_code == 201
    data = response.json()
    return data["game_id"]


# --- Suggestions Endpoint Tests ---

def test_get_suggestions_success(client, active_game):
    """GET /game/{game_id}/suggestions returns 4–5 public projection suggestions."""
    response = client.get(f"/game/{active_game}/suggestions?player_id=P1")
    assert response.status_code == 200
    data = response.json()
    assert "suggestions" in data
    suggestions = data["suggestions"]
    assert 4 <= len(suggestions) <= 5

    for s in suggestions:
        assert "id" in s
        assert "title" in s
        assert "description" in s
        assert "category" in s
        # Ensure no internal rule payload or metadata is leaked
        assert "rule_payload" not in s
        assert "validation_metadata" not in s


def test_get_suggestions_stability_same_turn(client, active_game):
    """Calling suggestions endpoint repeatedly during the same turn returns identical items."""
    res1 = client.get(f"/game/{active_game}/suggestions?player_id=P1")
    res2 = client.get(f"/game/{active_game}/suggestions?player_id=P1")

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["suggestions"] == res2.json()["suggestions"]


def test_get_suggestions_different_for_different_players(client, active_game):
    """Different players receive different sets or orderings of suggestions."""
    res1 = client.get(f"/game/{active_game}/suggestions?player_id=P1")
    res2 = client.get(f"/game/{active_game}/suggestions?player_id=P2")

    assert res1.status_code == 200
    assert res2.status_code == 200
    ids_p1 = [s["id"] for s in res1.json()["suggestions"]]
    ids_p2 = [s["id"] for s in res2.json()["suggestions"]]
    assert ids_p1 != ids_p2


def test_get_suggestions_game_not_found(client):
    """Unknown game returns 404."""
    response = client.get("/game/non-existent-game-id/suggestions?player_id=P1")
    assert response.status_code == 404


def test_get_suggestions_invalid_player(client, active_game):
    """Invalid player ID returns 400."""
    response = client.get(f"/game/{active_game}/suggestions?player_id=UNKNOWN_PLAYER")
    assert response.status_code == 400


# --- Amend Endpoint Tests (Predefined vs Custom Text) ---

@patch("backend.app.compile_amendment")
def test_predefined_amendment_never_invokes_ai(mock_compile, client, active_game):
    """Submitting a predefined amendment ID never calls compile_amendment or the AI provider."""
    response = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_001"},
    )
    assert response.status_code == 200
    data = response.json()

    # AI compiler must NEVER be called
    mock_compile.assert_not_called()

    # Predefined amendment should be accepted and added
    assert data["accepted"] is True
    assert data["rule"] is not None
    assert data["rule"]["id"] == "A1"
    assert data["error"] is None

    # Verify rule in state
    state = data["state"]
    assert len(state["rules"]) == 1

    # Turn should advance to next player (P2 / index 1)
    assert state["current_player"] == 1


@patch("backend.app.compile_amendment")
def test_custom_text_still_invokes_ai_court(mock_compile, client, active_game):
    """Submitting custom text continues to invoke the AI compiler."""
    mock_compile.return_value = {
        "accepted": True,
        "valid": True,
        "category": "valid_rule",
        "rule": {
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 2, "target": "self"},
            "source": "Gain 2 points on land",
        },
        "error": None,
    }

    response = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1", "text": "Gain 2 points on land"},
    )
    assert response.status_code == 200
    data = response.json()

    # AI compiler must be called once
    mock_compile.assert_called_once()
    assert data["accepted"] is True
    assert len(data["state"]["rules"]) == 1


@patch("backend.app.compile_amendment")
def test_unknown_amendment_id_rejected(mock_compile, client, active_game):
    """Unknown amendment ID is rejected safely without invoking AI."""
    response = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_999999"},
    )
    assert response.status_code == 200
    data = response.json()

    mock_compile.assert_not_called()
    assert data["accepted"] is False
    assert data["category"] == "invalid_rule"
    assert "unknown amendment id" in data["error"].lower()


@patch("backend.app.compile_amendment")
def test_invalid_rule_payload_rejected(mock_compile, client, active_game):
    """Flagged invalid amendments in library (e.g. AMEND_901) are rejected by engine validator."""
    response = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_901"},
    )
    assert response.status_code == 200
    data = response.json()

    mock_compile.assert_not_called()
    assert data["accepted"] is False
    assert data["category"] == "invalid_rule"
    assert data["error"] is not None


def test_amend_rejects_both_inputs(client, active_game):
    """Providing both text and amendment_id returns 400 Bad Request."""
    response = client.post(
        f"/game/{active_game}/amend",
        json={
            "player_id": "P1",
            "text": "Some custom text",
            "amendment_id": "AMEND_001",
        },
    )
    assert response.status_code == 400
    assert "exactly one" in response.json()["detail"].lower()


def test_amend_rejects_neither_input(client, active_game):
    """Providing neither text nor amendment_id returns 400 Bad Request."""
    response = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1"},
    )
    assert response.status_code == 400
    assert "exactly one" in response.json()["detail"].lower()


@patch("backend.app.compile_amendment")
def test_capacity_check_for_predefined_amendment(mock_compile, client):
    """When max rules limit is reached, predefined amendments are rejected."""
    request_data = {
        "settings": {
            "board_size": 10,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8,
            "amend_every": None,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=request_data)
    assert create_res.status_code == 201
    game_id = create_res.json()["game_id"]

    # Fill rules up to the maximum capacity of 8
    games[game_id]["rules"] = [
        {
            "id": f"A{i}",
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 1, "target": "self"},
            "source": f"Rule {i}",
        }
        for i in range(8)
    ]

    # Predefined amendment submission should be rejected due to capacity (max_rules=8)
    res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_001"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["accepted"] is False
    assert data["category"] == "invalid_rule"
    assert "max rules" in data["error"].lower()
    mock_compile.assert_not_called()


@patch("backend.app.compile_amendment")
def test_predefined_various_categories_zero_ai(mock_compile, client, active_game):
    """Enacting rules from different categories succeeds and never calls AI compiler."""
    # Test scoring: AMEND_010
    res = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_010"},
    )
    assert res.status_code == 200
    assert res.json()["accepted"] is True
    assert res.json()["rule"]["id"] == "A1"
    mock_compile.assert_not_called()

    # Turn advanced to P2; test movement: AMEND_029
    res2 = client.post(
        f"/game/{active_game}/amend",
        json={"player_id": "P2", "amendment_id": "AMEND_029"},
    )
    assert res2.status_code == 200
    assert res2.json()["accepted"] is True
    assert res2.json()["rule"]["id"] == "A2"
    mock_compile.assert_not_called()


def test_live_turn_ownership_enforced(client):
    """Only qualifying player who completed the turn can amend in live mode."""
    request_data = {
        "settings": {
            "board_size": 8,
            "dice_type": "1d6",
            "win_target": 30,
            "mode": "live",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=request_data)
    game_id = create_res.json()["game_id"]

    # P1 rolls dice and finishes turn
    roll_res = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 200

    # P2 attempts to amend instead of P1
    res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P2", "amendment_id": "AMEND_001"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["accepted"] is False
    assert "only the player who completed" in data["error"].lower()

    # P1 amends correctly
    res_ok = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_001"},
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["accepted"] is True
