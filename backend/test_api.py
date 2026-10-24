"""
API tests for AMENDMENT FastAPI backend.

Uses TestClient and mocked Court providers - no Ollama or internet required.
"""

import random
import pytest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient

from backend.app import app, set_rng_factory, games


@pytest.fixture(autouse=True)
def reset_games():
    """Clear games storage before each test."""
    games.clear()
    yield
    games.clear()


@pytest.fixture
def deterministic_rng():
    """Provide a deterministic RNG for testing."""
    def factory():
        rng = random.Random(42)
        return rng
    set_rng_factory(factory)
    yield
    # Reset to default
    set_rng_factory(lambda: random.Random())


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


# --- Root endpoint ---

def test_root_endpoint(client):
    """Should return API info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "AMENDMENT API"
    assert data["status"] == "running"


# --- Game creation tests ---

def test_create_game_draft_mode(client, deterministic_rng):
    """Should create a game in draft mode."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8,
            "amend_every": None
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }

    response = client.post("/game/new", json=request_data)
    assert response.status_code == 201

    data = response.json()
    assert "game_id" in data
    assert "state" in data

    state = data["state"]
    assert state["phase"] == "drafting"
    assert len(state["players"]) == 2
    assert len(state["rules"]) == 1  # Only R2
    assert state["rules"][0]["id"] == "R2"
    assert state["turn"] == 0


def test_create_game_live_mode(client, deterministic_rng):
    """Should create a game in live mode."""
    request_data = {
        "settings": {
            "board_size": 8,
            "dice_type": "2d6",
            "win_target": 30,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 2
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }

    response = client.post("/game/new", json=request_data)
    assert response.status_code == 201

    state = response.json()["state"]
    assert state["phase"] == "playing"  # Live starts playing
    assert state["settings"]["amend_every"] == 2


def test_create_game_invalid_board_size(client):
    """Should reject invalid board size."""
    request_data = {
        "settings": {
            "board_size": 7,  # Invalid
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8
        },
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }

    response = client.post("/game/new", json=request_data)
    assert response.status_code == 400
    assert "board_size" in response.json()["detail"]


def test_create_game_insufficient_players(client):
    """Should reject game with < 2 players."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8
        },
        "players": [{"id": "P1", "name": "Alice"}]  # Only 1 player
    }

    response = client.post("/game/new", json=request_data)
    assert response.status_code == 400
    assert "2 players" in response.json()["detail"]


# --- Game state retrieval tests ---

def test_get_game_state(client, deterministic_rng):
    """Should retrieve game state."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Get state
    response = client.get(f"/game/{game_id}")
    assert response.status_code == 200

    data = response.json()
    assert "state" in data
    assert data["state"]["game_id"] == game_id


def test_get_nonexistent_game(client):
    """Should return 404 for nonexistent game."""
    response = client.get("/game/nonexistent-id")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


# --- Turn execution tests ---

def test_execute_turn(client, deterministic_rng):
    """Should execute a turn successfully."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Execute turn
    response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert response.status_code == 200

    data = response.json()
    assert "state" in data
    assert "roll" in data
    assert 1 <= data["roll"] <= 6  # 1d6

    state = data["state"]
    assert state["phase"] == "playing"  # Draft -> playing transition
    assert state["turn"] == 1


def test_execute_turn_wrong_player(client, deterministic_rng):
    """Should reject turn by non-current player."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # P2 tries to roll but it's P1's turn
    response = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert response.status_code == 400
    assert "Not P2's turn" in response.json()["detail"]


def test_execute_turn_nonexistent_game(client):
    """Should return 404 for nonexistent game."""
    response = client.post("/game/nonexistent/roll", json={"player_id": "P1"})
    assert response.status_code == 404


# --- Amendment tests ---

@patch('backend.app.compile_amendment')
def test_submit_amendment_accepted(mock_compile, client, deterministic_rng):
    """Should accept and add a valid amendment."""
    # Create game in draft mode
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Mock Court response
    mock_compile.return_value = {
        "accepted": True,
        "rule": {
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 2, "target": "self"},
            "source": "When you land, gain 2 points"
        },
        "error": None
    }

    # Submit amendment
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "When you land, gain 2 points"}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["accepted"] is True
    assert data["rule"] is not None
    assert data["rule"]["id"] == "A1"  # Engine assigned ID
    assert data["error"] is None

    # Verify rule was added to state
    state = data["state"]
    assert len(state["rules"]) == 2  # R2 + A1


@patch('backend.app.compile_amendment')
def test_submit_amendment_rejected_by_court(mock_compile, client, deterministic_rng):
    """Should reject invalid amendment."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Mock Court rejection
    mock_compile.return_value = {
        "accepted": False,
        "rule": None,
        "error": "Invalid trigger: 'on_death'"
    }

    # Submit invalid amendment
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "When you die, gain points"}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["accepted"] is False
    assert data["rule"] is None
    assert "Invalid trigger" in data["error"]

    # Verify no rule was added
    state = data["state"]
    assert len(state["rules"]) == 1  # Still only R2


def test_submit_amendment_not_allowed(client, deterministic_rng):
    """Should reject amendment when not allowed (e.g., hybrid mode)."""
    # Create game in hybrid mode (need at least one rulebook)
    # For now, just test with playing mode without amendments
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 2},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Try to amend before enough moves
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "When you land, gain 2 points"}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["accepted"] is False
    assert "not available" in data["error"] or "need" in data["error"]


def test_submit_amendment_nonexistent_player(client, deterministic_rng):
    """Should reject amendment from unknown player."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Submit amendment from non-existent player
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P3", "text": "Some rule"}
    )
    assert response.status_code == 404
    assert "P3 not found" in response.json()["detail"]


@patch('backend.app.compile_amendment')
def test_submit_amendment_max_rules_reached(mock_compile, client, deterministic_rng):
    """Should reject amendment when max rules reached."""
    # Create game with max_rules=8 (R2 + 7 amendments max)
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]
    state = games[game_id]

    # Mock Court acceptance
    mock_compile.return_value = {
        "accepted": True,
        "rule": {
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 1, "target": "self"},
            "source": "test rule"
        },
        "error": None
    }

    # Add 7 amendments (max_rules = 8, R2 counts as 1)
    for i in range(7):
        response = client.post(
            f"/game/{game_id}/amend",
            json={"player_id": "P1", "text": f"Rule {i+1}"}
        )
        assert response.status_code == 200
        assert response.json()["accepted"] is True

    # 8th amendment should be rejected
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "Rule 8"}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["accepted"] is False
    assert "Max rules" in data["error"]


@patch('backend.app.compile_amendment')
def test_submit_amendment_court_failure(mock_compile, client, deterministic_rng):
    """Should handle Court provider failure gracefully."""
    # Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    game_id = create_response.json()["game_id"]

    # Mock Court exception
    mock_compile.side_effect = Exception("Provider unavailable")

    # Submit amendment
    response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "Some rule"}
    )
    assert response.status_code == 200

    data = response.json()
    assert data["accepted"] is False
    assert "Court compilation failed" in data["error"]


# --- Rulebooks endpoint tests ---

def test_list_rulebooks_empty(client):
    """Should return empty list when no rulebooks exist."""
    response = client.get("/rulebooks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


# --- Integration tests ---

def test_full_game_flow(client, deterministic_rng):
    """Test complete game flow: create, amend, roll, check state."""
    # 1. Create game
    request_data = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "draft", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    }
    create_response = client.post("/game/new", json=request_data)
    assert create_response.status_code == 201
    game_id = create_response.json()["game_id"]

    # 2. Check initial state
    state_response = client.get(f"/game/{game_id}")
    assert state_response.status_code == 200
    state = state_response.json()["state"]
    assert state["phase"] == "drafting"
    assert state["turn"] == 0

    # 3. Execute first turn (transitions to playing)
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_response.status_code == 200
    state = roll_response.json()["state"]
    assert state["phase"] == "playing"
    assert state["turn"] == 1

    # 4. Execute second turn
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert roll_response.status_code == 200
    state = roll_response.json()["state"]
    assert state["turn"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
