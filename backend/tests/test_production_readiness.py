"""
Tests for production readiness, resource bounds, and capacity limits.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app import app, games, MAX_STORED_GAMES, _store_game
from backend.court.compiler import compile_amendment


client = TestClient(app)


def test_long_proposal_rejected_safely():
    """Proposal text exceeding 500 characters must be rejected immediately without calling LLM."""
    state = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 21, "max_rules": 8, "mode": "draft"},
        "rules": [],
        "players": []
    }
    long_text = "Gain 1 point " * 50  # 650 characters
    result = compile_amendment(long_text, state)
    assert result["accepted"] is False
    assert result["category"] == "not_a_game_rule"
    assert "exceeds maximum length" in result["error"]


def test_max_player_limit_enforced():
    """Game creation with more than 4 players must return 400 Bad Request."""
    payload = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 21,
            "mode": "draft",
            "max_rules": 8
        },
        "players": [
            {"id": f"P{i}", "name": f"Player {i}"} for i in range(1, 6)  # 5 players
        ]
    }
    resp = client.post("/game/new", json=payload)
    assert resp.status_code == 400
    assert "Maximum 4 players allowed" in resp.json()["detail"]


def test_player_name_validation():
    """Player names cannot be empty or excessively long (> 50 chars)."""
    base_settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 21,
        "mode": "draft",
        "max_rules": 8
    }
    # Empty name
    resp_empty = client.post("/game/new", json={
        "settings": base_settings,
        "players": [
            {"id": "P1", "name": "   "},
            {"id": "P2", "name": "Bob"}
        ]
    })
    assert resp_empty.status_code == 400
    assert "Player name cannot be empty" in resp_empty.json()["detail"]

    # Overly long name
    resp_long = client.post("/game/new", json={
        "settings": base_settings,
        "players": [
            {"id": "P1", "name": "A" * 51},
            {"id": "P2", "name": "Bob"}
        ]
    })
    assert resp_long.status_code == 400
    assert "Player name cannot exceed 50 characters" in resp_long.json()["detail"]


def test_store_game_capacity_eviction():
    """_store_game evicts finished games or oldest games when capacity is exceeded."""
    original_games = dict(games)
    try:
        games.clear()
        # Insert games up to limit
        for i in range(MAX_STORED_GAMES):
            games[f"game_{i}"] = {"phase": "finished" if i == 0 else "playing"}

        assert len(games) == MAX_STORED_GAMES
        # Storing a new game should evict the finished game (game_0)
        _store_game("game_new", {"phase": "playing"})
        assert len(games) == MAX_STORED_GAMES
        assert "game_0" not in games
        assert "game_new" in games
    finally:
        games.clear()
        games.update(original_games)
