import pytest
import random
from backend.engine.state import create_game, add_amendment
from backend.engine.engine import execute_turn, normalize_condition
from backend.engine.validate import validate_rule
from backend.court.compiler import compile_amendment

def test_finished_game_execute_turn_noop():
    """Bug #1: Ensure finished game cannot be mutated by execute_turn."""
    settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 10,
        "mode": "live",
        "max_rules": 8,
        "amend_every": 1,
    }
    players = [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    state = create_game(settings, players)
    state["phase"] = "finished"
    state["winner"] = "P1"
    state["players"][0]["score"] = 15
    state["players"][0]["position"] = 12
    state["turn"] = 4
    
    rng = random.Random(42)
    new_state = execute_turn(state, rng)
    
    assert new_state["players"][0]["score"] == 15
    assert new_state["players"][0]["position"] == 12
    assert new_state["turn"] == 4
    assert new_state["phase"] == "finished"
    assert new_state["winner"] == "P1"

def test_highest_score_wins_when_multiple_contenders_reach_target():
    """Bug #2: When multiple players cross win target, player with highest score wins."""
    settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 25,
        "mode": "live",
        "max_rules": 8,
        "amend_every": 1,
    }
    players = [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}]
    state = create_game(settings, players)
    
    # P1 has 24, P2 has 30.
    state["players"][0]["score"] = 24
    state["players"][1]["score"] = 30
    state["current_player"] = 0
    
    # P1 rolls 1 -> score becomes 25 (reaches win_target 25).
    # P2 already has 30 (> 25). P2 must be crowned winner!
    fixed_rng = random.Random(0)
    # Using a FixedRNG or mock
    class MockRNG:
        def randint(self, a, b):
            return 1
            
    execute_turn(state, MockRNG())
    
    assert state["players"][0]["score"] == 25
    assert state["players"][1]["score"] == 30
    assert state["phase"] == "finished"
    assert state["winner"] == "P2", f"Expected P2 with 30 pts to win, got {state['winner']}"

def test_unhashable_predicate_args_normalization():
    """Bug #5: Predicates with nested lists or dicts must normalize safely without crash."""
    cond = {
        "mode": "all",
        "predicates": [
            {"name": "complex_pred", "args": {"nested_list": [1, 2, [3, 4]], "nested_dict": {"k": [5, 6]}}}
        ]
    }
    res = normalize_condition(cond)
    assert res[0] == "single"
    # Ensure hashable into set
    test_set = {res}
    assert res in test_set

def test_empty_and_whitespace_proposal_rejected():
    """Bug #4: Empty or whitespace rule proposal text must be rejected early."""
    state = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 21, "max_rules": 8},
        "rules": [],
        "players": [],
    }
    for blank in ["", "   ", "\n\t  "]:
        res = compile_amendment(blank, state, validate_rule)
        assert res["accepted"] is False
        assert res["category"] == "not_a_game_rule"
        assert "empty" in res["error"].lower()

def test_set_win_target_normalization():
    """Bug #3: set_win_target with missing or 'ignored' target normalizes to 'self'."""
    rule_with_ignored = {
        "trigger": "win_check",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "set_win_target", "amount": 25, "target": "ignored"},
        "source": "Set win target to 25"
    }
    valid, err = validate_rule(rule_with_ignored)
    assert valid is True
    assert rule_with_ignored["effect"]["target"] == "self"

def test_boolean_amounts_rejected():
    """Bug #6: Booleans masquerading as ints must be rejected."""
    rule_bool_amount = {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "add_score", "amount": True, "target": "self"},
        "source": "Invalid bool amount"
    }
    valid, err = validate_rule(rule_bool_amount)
    assert valid is False
    assert "Missing or non-int effect.amount" in err

    rule_bool_score_gt = {
        "trigger": "on_turn_start",
        "condition": {"mode": "all", "predicates": [{"name": "score_gt", "args": {"value": True}}]},
        "effect": {"type": "add_score", "amount": 1, "target": "self"},
        "source": "Invalid bool score_gt"
    }
    valid, err = validate_rule(rule_bool_score_gt)
    assert valid is False
    assert "score_gt requires args.value (int)" in err

def test_amendment_id_collision_prevention():
    """Bug #7: Amendment IDs must never collide with existing rules."""
    settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 25,
        "mode": "live",
        "max_rules": 8,
        "amend_every": 1,
    }
    players = [{"id": "P1", "name": "Alice"}]
    state = create_game(settings, players)
    # Pre-populate rules with an ID that might collide
    state["rules"] = [
        {"id": "A1", "trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}},
        {"id": "AMEND_001", "trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}},
    ]
    new_rule = {"trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 2, "target": "self"}}
    ok, err = add_amendment(state, new_rule)
    assert ok is True
    # The new rule ID should be A2, not colliding with A1
    assert state["rules"][-1]["id"] == "A2"
    
    # Add another
    ok2, _ = add_amendment(state, new_rule)
    assert ok2 is True
    assert state["rules"][-1]["id"] == "A3"
