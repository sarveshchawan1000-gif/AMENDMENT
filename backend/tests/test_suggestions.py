"""
Unit tests for the suggestion selection engine.
"""

import copy
import pytest
from backend.engine.state import create_game
from backend.engine.suggestions import get_player_suggestions
from backend.engine.amendment_library import get_amendment_by_id


@pytest.fixture
def basic_game_state():
    """Create a standard 2-player game state."""
    settings = {
        "board_size": 10,
        "dice_type": "d6",
        "win_target": 20,
        "mode": "quick",
        "max_rules": 5,
        "amend_every": 2,
    }
    players = [
        {"id": "P1", "name": "Alice"},
        {"id": "P2", "name": "Bob"},
    ]
    state = create_game(settings, players)
    state["turn"] = 1
    return state


def test_suggestions_stability_same_turn(basic_game_state):
    """Reopening the composer in the same turn must return identical suggestions."""
    suggestions_1 = get_player_suggestions(basic_game_state, "P1", count=4)
    suggestions_2 = get_player_suggestions(basic_game_state, "P1", count=4)

    assert len(suggestions_1) == 4
    assert len(suggestions_2) == 4
    assert [s["id"] for s in suggestions_1] == [s["id"] for s in suggestions_2]
    assert [s["title"] for s in suggestions_1] == [s["title"] for s in suggestions_2]


def test_suggestions_differ_across_players(basic_game_state):
    """Suggestions should differ across players where the pool permits."""
    # When requesting 4 out of 8 valid candidates, distinct seeds give different selections / ordering
    p1_suggestions = get_player_suggestions(basic_game_state, "P1", count=4)
    p2_suggestions = get_player_suggestions(basic_game_state, "P2", count=4)

    p1_ids = [s["id"] for s in p1_suggestions]
    p2_ids = [s["id"] for s in p2_suggestions]

    # Either the IDs selected or their order differs
    assert p1_ids != p2_ids


def test_invalid_rules_never_suggested(basic_game_state):
    """Flagged or engine-invalid rules like AMEND_901 or AMEND_902 are never suggested."""
    suggestions = get_player_suggestions(basic_game_state, "P1", count=10)
    suggested_ids = [s["id"] for s in suggestions]

    assert "AMEND_901" not in suggested_ids
    assert "AMEND_902" not in suggested_ids


def test_active_rules_excluded(basic_game_state):
    """If an amendment is already active in state, it must not be suggested."""
    # Activate AMEND_001 in state
    amend_001 = get_amendment_by_id("AMEND_001")
    assert amend_001 is not None
    basic_game_state["rules"].append(copy.deepcopy(amend_001["rule_payload"]))

    suggestions = get_player_suggestions(basic_game_state, "P1", count=10)
    suggested_ids = [s["id"] for s in suggestions]

    assert "AMEND_001" not in suggested_ids


def test_suggestions_public_projection(basic_game_state):
    """Returned suggestions expose only client-safe fields (id, title, description, category)."""
    suggestions = get_player_suggestions(basic_game_state, "P1", count=5)
    assert len(suggestions) > 0

    for s in suggestions:
        assert set(s.keys()) == {"id", "title", "description", "category"}
        assert isinstance(s["id"], str)
        assert isinstance(s["title"], str)
        assert isinstance(s["description"], str)
        assert isinstance(s["category"], str)


def test_unknown_player_raises_error(basic_game_state):
    """Querying suggestions for a player not in state raises ValueError."""
    with pytest.raises(ValueError, match="not found in game state"):
        get_player_suggestions(basic_game_state, "NON_EXISTENT_PLAYER", count=5)


def test_history_deduplication_across_turns(basic_game_state):
    """Rolling history avoids repeating the same suggestions on the next turn."""
    basic_game_state["turn"] = 1
    turn1_suggs = get_player_suggestions(basic_game_state, "P1", count=4)
    turn1_ids = set(s["id"] for s in turn1_suggs)

    # Advance turn
    basic_game_state["turn"] = 2
    turn2_suggs = get_player_suggestions(basic_game_state, "P1", count=4)
    turn2_ids = set(s["id"] for s in turn2_suggs)

    # With our expanded library and rolling history, turn 2 draws from fresh items
    # and is completely disjoint from turn 1.
    assert turn1_ids.isdisjoint(turn2_ids)


def test_usability_filter_win_target_not_suggested_if_already_at_target(basic_game_state):
    """If the game win_target is already 25, set_win_target 25 (AMEND_007) is not suggested."""
    basic_game_state["settings"]["win_target"] = 25
    suggestions = get_player_suggestions(basic_game_state, "P1", count=100)
    suggested_ids = [s["id"] for s in suggestions]
    assert "AMEND_007" not in suggested_ids


def test_large_pool_category_diversity(basic_game_state):
    """Across suggestions over multiple turns, all 5 categories are offered to players."""
    categories_seen = set()
    for turn in range(1, 8):
        basic_game_state["turn"] = turn
        suggs = get_player_suggestions(basic_game_state, "P1", count=5)
        for s in suggs:
            categories_seen.add(s["category"])

    expected = {"scoring", "movement", "catch_up", "disruption", "endgame"}
    assert categories_seen == expected


def test_suggestions_cache_fresh_across_draft_rounds(basic_game_state):
    """In draft mode where turn remains 0, subsequent draft rounds receive full fresh suggestions."""
    # Round 1
    suggs_r1 = get_player_suggestions(basic_game_state, "P1", count=5)
    assert len(suggs_r1) == 5
    r1_ids = [s["id"] for s in suggs_r1]

    # Enact first suggestion
    first_rule = get_amendment_by_id(r1_ids[0])
    basic_game_state["rules"].append(copy.deepcopy(first_rule["rule_payload"]))

    # Round 2 (turn is still 0, but rules count is now 1)
    suggs_r2 = get_player_suggestions(basic_game_state, "P1", count=5)
    assert len(suggs_r2) == 5, f"Expected 5 suggestions in round 2, got {len(suggs_r2)}"
    r2_ids = [s["id"] for s in suggs_r2]

    # Fresh candidates must be provided (disjoint from round 1)
    assert set(r1_ids).isdisjoint(set(r2_ids))


def test_suggestions_depleted_cache_fallback(basic_game_state):
    """If cached rules become active or unusable, suggestions regenerate to meet requested count."""
    suggs = get_player_suggestions(basic_game_state, "P1", count=5)
    assert len(suggs) == 5

    # Activate one of the suggested rules in state directly without changing rules count
    # by replacing an existing dummy rule
    basic_game_state["rules"].append(copy.deepcopy(get_amendment_by_id(suggs[0]["id"])["rule_payload"]))

    # Query again with same active_rules count if cache was populated
    fresh_suggs = get_player_suggestions(basic_game_state, "P1", count=5)
    assert len(fresh_suggs) == 5
    assert suggs[0]["id"] not in [s["id"] for s in fresh_suggs]
