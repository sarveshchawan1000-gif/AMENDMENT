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


def test_cannot_roll_again_while_amendment_phase_active(client, deterministic_rng):
    """A player cannot repeatedly roll the dice while their amendment phase is active."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls first time
    roll1 = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll1.status_code == 200
    state1 = roll1.json()["state"]
    assert state1["amendment_phase"]["active"] is True
    assert state1["amendment_phase"]["player_id"] == "P1"

    # P1 attempts repeated roll during amendment phase
    roll_again = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_again.status_code == 400
    assert "amendment phase is currently active" in roll_again.json()["detail"].lower()

    # P2 also cannot roll during P1's amendment phase
    roll_p2 = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert roll_p2.status_code == 400


def test_unauthorized_player_cannot_amend_or_pass(client, deterministic_rng):
    """An unauthorized player cannot submit an amendment or pass during another player's phase."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # P2 attempts to pass P1's opportunity
    pass_res = client.post(f"/game/{game_id}/pass-amendment", json={"player_id": "P2"})
    assert pass_res.status_code == 200
    assert pass_res.json()["accepted"] is False
    assert "qualifying turn" in pass_res.json()["error"].lower()

    # Verify P1's amendment phase is still intact
    state = games[game_id]
    assert state["current_player"] == 0
    assert state["amendment_phase"]["active"] is True
    assert state["amendment_phase"]["player_id"] == "P1"

    # P2 attempts to amend
    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P2", "amendment_id": "AMEND_001"},
    )
    assert amend_res.status_code == 200
    assert amend_res.json()["accepted"] is False
    assert "qualifying turn" in amend_res.json()["error"].lower()

    # Verify turn did NOT advance
    assert games[game_id]["current_player"] == 0


def test_invalid_predefined_amendment_consumes_opportunity_and_advances_turn(client, deterministic_rng):
    """Submitting an invalid predefined amendment immediately consumes the turn and advances to next player."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # P1 submits invalid amendment ID
    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_NONEXISTENT_999"},
    )
    assert amend_res.status_code == 200
    data = amend_res.json()
    assert data["accepted"] is False
    assert data["category"] == "invalid_rule"

    # Turn MUST advance to P2 and amendment_phase must be cleared
    post_state = data["state"]
    assert post_state["current_player"] == 1  # P2
    assert post_state["amendment_phase"] is None
    assert post_state["moves_since_amend"] == 0

    # P1 cannot submit a second amendment
    amend_res2 = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "amendment_id": "AMEND_001"},
    )
    assert amend_res2.status_code == 200
    assert amend_res2.json()["accepted"] is False

    # P1 cannot roll again
    roll_res = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 400

    # P2 can now roll
    roll_p2 = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert roll_p2.status_code == 200


@patch("backend.app.compile_amendment")
def test_court_rejected_proposal_consumes_opportunity_and_advances_turn(mock_compile, client, deterministic_rng):
    """A custom amendment rejected by AI Court consumes the turn immediately and advances to next player."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Court rejects proposal
    mock_compile.return_value = {
        "accepted": False,
        "category": "not_a_game_rule",
        "rule": None,
        "error": "This text does not describe a valid rule.",
    }

    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "hello world this is not a rule"},
    )
    assert amend_res.status_code == 200
    data = amend_res.json()
    assert data["accepted"] is False

    # Opportunity is consumed, turn advanced to P2
    post_state = data["state"]
    assert post_state["current_player"] == 1
    assert post_state["amendment_phase"] is None

    # P1 cannot roll again
    roll_res = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 400


@patch("backend.app.compile_amendment")
def test_infrastructure_court_error_does_not_consume_opportunity(mock_compile, client, deterministic_rng):
    """An AI Court infrastructure error (category court_error) does not advance the turn or consume the opportunity."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Court fails with infrastructure error
    mock_compile.return_value = {
        "accepted": False,
        "category": "court_error",
        "rule": None,
        "error": "Court AI provider unavailable",
    }

    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "give me 3 points"},
    )
    assert amend_res.status_code == 200
    data = amend_res.json()
    assert data["accepted"] is False
    assert data["category"] == "court_error"

    # Opportunity is NOT consumed, turn has NOT advanced
    post_state = data["state"]
    assert post_state["current_player"] == 0
    assert post_state["amendment_phase"]["active"] is True
    assert post_state["amendment_phase"]["player_id"] == "P1"

    # P1 can now pass or submit a predefined amendment to complete the turn
    pass_res = client.post(f"/game/{game_id}/pass-amendment", json={"player_id": "P1"})
    assert pass_res.status_code == 200
    assert pass_res.json()["state"]["current_player"] == 1


def test_timer_expiration_auto_advances_turn(client, deterministic_rng):
    """When the 60-second timer expires, the phase is automatically ended and turn advances to next player."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert games[game_id]["amendment_phase"]["active"] is True

    # Simulate 60 seconds passing by backdating the deadline
    games[game_id]["amendment_phase"]["deadline"] = 0

    # Client retrieves state (or any request arrives)
    get_res = client.get(f"/game/{game_id}")
    assert get_res.status_code == 200
    state = get_res.json()["state"]

    # Turn should have automatically advanced to P2
    assert state["current_player"] == 1
    assert state["amendment_phase"] is None
    assert state["moves_since_amend"] == 0

    # P1 cannot roll
    roll_p1 = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_p1.status_code == 400

    # P2 can roll
    roll_p2 = client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    assert roll_p2.status_code == 200


@patch("backend.app.compile_amendment")
def test_late_ai_court_response_after_deadline_does_not_enact(mock_compile, client, deterministic_rng):
    """If an AI Court request resolves after the timer deadline, it must not enact or reopen the phase."""
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 12,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    response = client.post("/game/new", json=request_data)
    game_id = response.json()["game_id"]

    # P1 rolls
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Simulate compilation taking so long that deadline expires during compilation
    def slow_compile(text, state, val_fn):
        games[game_id]["amendment_phase"]["deadline"] = 0  # expired
        return {
            "accepted": True,
            "rule": {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 2, "target": "self"},
                "source": "late rule",
            },
            "error": None,
        }

    mock_compile.side_effect = slow_compile

    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "late amendment"},
    )
    assert amend_res.status_code == 200
    data = amend_res.json()
    assert data["accepted"] is False
    assert "expired" in data["error"].lower()

    # Rule must NOT be in state
    post_state = data["state"]
    assert len(post_state["rules"]) == 0
    # Turn must have advanced to P2
    assert post_state["current_player"] == 1
    assert post_state["amendment_phase"] is None


def test_draft_mode_polling_lifecycle(client, deterministic_rng):
    """
    Ensure Draft Mode lifecycle maintains 'drafting' phase across polling,
    does not open unexpected amendment phases, and transitions to 'playing'
    only upon the first dice roll.
    """
    request_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Gemma"},
        ],
    }
    create_res = client.post("/game/new", json=request_data)
    assert create_res.status_code == 201
    game_id = create_res.json()["game_id"]

    # Multiple polling queries simulate frontend periodic polling
    for _ in range(5):
        poll_res = client.get(f"/game/{game_id}")
        assert poll_res.status_code == 200
        state = poll_res.json()["state"]
        assert state["phase"] == "drafting"
        assert state["turn"] == 0
        assert state["current_player"] == 0
        assert state.get("amendment_phase") is None

    # First roll initiates active gameplay
    roll_res = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 200
    post_roll_state = roll_res.json()["state"]
    assert post_roll_state["phase"] == "playing"
    assert post_roll_state["current_player"] == 1  # advanced to P2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])


