"""
Tests for turn advancement logic with amendments.

These tests verify that:
1. Turn advances properly after roll when no amendment is available
2. Turn does NOT advance after roll when amendment is available
3. Turn advances after amendment is submitted
4. Turn advances after amendment is passed
"""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.app import app, set_rng_factory, games
import random


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def deterministic_rng():
    """Set deterministic RNG for testing."""
    def rng_factory():
        rng = random.Random(42)
        return rng
    set_rng_factory(rng_factory)
    yield
    # Reset to default after test
    set_rng_factory(lambda: random.Random())


@pytest.fixture(autouse=True)
def clear_games():
    """Clear games dict before each test."""
    games.clear()
    yield
    games.clear()


def test_turn_advances_when_no_amendment_available(client, deterministic_rng):
    """
    In draft mode (no amendments in playing phase),
    turn should advance immediately after roll.
    """
    # Create game in draft mode
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # Get initial state
    state_response = client.get(f"/game/{game_id}")
    initial_state = state_response.json()["state"]
    assert initial_state["current_player"] == 0  # P1's turn
    assert initial_state["phase"] == "drafting"

    # Transition to playing by setting phase manually (simulate draft completion)
    games[game_id]["phase"] = "playing"

    # P1 rolls
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_response.status_code == 200

    post_roll_state = roll_response.json()["state"]

    # Turn should have advanced to P2 (index 1) since no amendment available in draft mode
    assert post_roll_state["current_player"] == 1  # P2's turn now


def test_turn_does_not_advance_when_amendment_available(client, deterministic_rng):
    """
    In live mode with amend_every=1, turn should NOT advance after roll
    because amendment opportunity is available.
    """
    # Create game in live mode with amend_every=1
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # Get initial state
    state_response = client.get(f"/game/{game_id}")
    initial_state = state_response.json()["state"]
    assert initial_state["current_player"] == 0  # P1's turn
    assert initial_state["moves_since_amend"] == 0

    # P1 rolls
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_response.status_code == 200

    post_roll_state = roll_response.json()["state"]

    # Turn should NOT have advanced - still P1's turn
    assert post_roll_state["current_player"] == 0  # Still P1
    assert post_roll_state["moves_since_amend"] == 1  # Move completed
    # Amendment is now available


@patch('backend.app.compile_amendment')
def test_turn_advances_after_amendment_submitted(mock_compile, client, deterministic_rng):
    """
    After submitting an amendment, turn should advance to next player.
    """
    # Create game in live mode
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    post_roll_state = roll_response.json()["state"]
    assert post_roll_state["current_player"] == 0  # Still P1

    # Mock Court accepting the amendment
    mock_compile.return_value = {
        "accepted": True,
        "rule": {
            "id": "A-123",
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 2, "target": "self"},
            "immutable": False,
            "source": "give me 2 points"
        },
        "error": None
    }

    # P1 submits amendment
    amend_response = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "give me 2 points"}
    )
    assert amend_response.status_code == 200
    amend_data = amend_response.json()
    assert amend_data["accepted"] is True

    post_amend_state = amend_data["state"]

    # Turn should now advance to P2
    assert post_amend_state["current_player"] == 1  # P2's turn
    assert post_amend_state["moves_since_amend"] == 0  # Reset


def test_turn_advances_after_pass(client, deterministic_rng):
    """
    After passing an amendment, turn should advance to next player.
    """
    # Create game in live mode
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    roll_response = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    post_roll_state = roll_response.json()["state"]
    assert post_roll_state["current_player"] == 0  # Still P1

    # P1 passes amendment
    pass_response = client.post(
        f"/game/{game_id}/pass-amendment",
        json={"player_id": "P1"}
    )
    assert pass_response.status_code == 200
    pass_data = pass_response.json()
    assert pass_data["accepted"] is True

    post_pass_state = pass_data["state"]

    # Turn should now advance to P2
    assert post_pass_state["current_player"] == 1  # P2's turn
    assert post_pass_state["moves_since_amend"] == 0  # Reset


def test_multiple_turns_with_amendments(client, deterministic_rng):
    """
    Test full cycle: P1 rolls+amends, P2 rolls+passes, P1 rolls again.
    """
    # Create game in live mode with amend_every=1
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"}
        ]
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # Round 1: P1 rolls
    roll1 = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll1.json()["state"]["current_player"] == 0  # Still P1

    # P1 passes
    pass1 = client.post(f"/game/{game_id}/pass-amendment", json={"player_id": "P1"})
    assert pass1.json()["state"]["current_player"] == 1  # Now P2

    # Round 2: P2 rolls
    roll2 = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert roll2.json()["state"]["current_player"] == 1  # Still P2

    # P2 passes
    pass2 = client.post(f"/game/{game_id}/pass-amendment", json={"player_id": "P2"})
    assert pass2.json()["state"]["current_player"] == 0  # Back to P1

    # Round 3: P1 rolls again
    roll3 = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll3.json()["state"]["current_player"] == 0  # Still P1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
