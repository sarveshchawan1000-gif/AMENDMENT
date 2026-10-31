import random
import pytest
from backend.engine.state import create_game, add_amendment, rank_players
from backend.engine.engine import execute_turn, normalize_condition
from backend.engine.validate import validate_rule, clamp_amount, clamp_win_target
from backend.court.compiler import compile_amendment

class FixedRNG:
    def __init__(self, values):
        self.values = list(values)
        self.idx = 0
    def randint(self, a, b):
        if self.idx < len(self.values):
            val = self.values[self.idx]
            self.idx += 1
            return val
        return a

# ---------------------------------------------------------------------------
# 1. WINNER SELECTION THOROUGH VERIFICATION
# ---------------------------------------------------------------------------

def test_winner_selection_higher_score_wins_regardless_of_order():
    """Verify that the highest score always wins, regardless of player registration order."""
    # Test with order [P1, P2]
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s1 = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}])
    s1["players"][0]["score"] = 25
    s1["players"][1]["score"] = 30
    execute_turn(s1, FixedRNG([1]))
    assert s1["winner"] == "P2", f"Expected P2 (score 30) to win, got {s1['winner']}"

    # Test with reversed order [P2, P1]
    s2 = create_game(settings, [{"id": "P2", "name": "Bob"}, {"id": "P1", "name": "Alice"}])
    s2["players"][0]["score"] = 30  # P2 at index 0
    s2["players"][1]["score"] = 25  # P1 at index 1
    execute_turn(s2, FixedRNG([1]))
    assert s2["winner"] == "P2", f"Expected P2 (score 30) to win, got {s2['winner']}"

def test_winner_selection_player_already_above_target_before_turn():
    """A player already above the target before the current turn is recognized if win check runs."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}])
    # P2 was at 28 points, P1 was at 20 points. P1 is the acting player (index 0).
    s["players"][0]["score"] = 20
    s["players"][1]["score"] = 28
    s["current_player"] = 0
    
    # P1 rolls 5 -> score becomes 25.
    # Now both P1 (25) and P2 (28) are >= 25.
    execute_turn(s, FixedRNG([5]))
    assert s["players"][0]["score"] == 25
    assert s["players"][1]["score"] == 28
    assert s["phase"] == "finished"
    assert s["winner"] == "P2", f"Expected P2 (28 pts) to win over P1 (25 pts), got {s['winner']}"

def test_winner_selection_multiple_cross_via_single_effect():
    """When a single effect (e.g. add_score to all_others) pushes multiple players over threshold."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}, {"id": "P3", "name": "Charlie"}])
    s["players"][0]["score"] = 10  # P1
    s["players"][1]["score"] = 22  # P2
    s["players"][2]["score"] = 24  # P3
    s["current_player"] = 0
    
    # Add rule: On land, add 3 points to all_others
    add_amendment(s, {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "add_score", "amount": 3, "target": "all_others"},
        "source": "Gift all others"
    })
    
    # P1 rolls 1.
    # On land: P2 gets +3 (22 -> 25). P3 gets +3 (24 -> 27). Both cross target 25.
    execute_turn(s, FixedRNG([1]))
    assert s["players"][1]["score"] == 25
    assert s["players"][2]["score"] == 27
    assert s["phase"] == "finished"
    assert s["winner"] == "P3", f"Expected P3 (score 27) to win, got {s['winner']}"

def test_winner_selection_score_tie_deterministic_policy():
    """When two contenders tie with the exact same winning score, deterministic index policy applies."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}])
    s["players"][0]["score"] = 26
    s["players"][1]["score"] = 26
    execute_turn(s, FixedRNG([1]))
    assert s["phase"] == "finished"
    # Tied scores share rank 1; secondary sort by registration index gives index 0 (P1)
    assert s["winner"] == "P1"

# ---------------------------------------------------------------------------
# 2. FINISHED GAME STATE IMMUTABILITY
# ---------------------------------------------------------------------------

def test_finished_game_complete_immutability():
    """Attempting further turns on a finished game mutates NO field whatsoever."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}])
    s["phase"] = "finished"
    s["winner"] = "P1"
    s["turn"] = 7
    s["moves_since_amend"] = 3
    s["current_player"] = 1
    s["players"][0]["score"] = 26
    s["players"][0]["position"] = 18
    s["players"][1]["score"] = 14
    s["players"][1]["position"] = 5
    s["log"] = [{"turn": 6, "player": "P1", "rule_id": "R1", "effect": "move", "before": 20, "after": 26, "details": None}]

    import copy
    snapshot = copy.deepcopy(s)
    
    # Execute turns repeatedly with random RNG
    for seed in range(10):
        res = execute_turn(s, random.Random(seed))
        assert res == snapshot, "State was mutated after game completion!"

# ---------------------------------------------------------------------------
# 3. COMPILER & VALIDATION INDEPENDENT VERIFICATION
# ---------------------------------------------------------------------------

def test_empty_and_whitespace_proposals_rejected_without_llm():
    """Empty and whitespace strings must be rejected deterministically by compiler."""
    dummy_state = {"settings": {"board_size": 6, "dice_type": "1d6", "win_target": 21, "max_rules": 8}, "rules": []}
    for blank in ["", " ", "   ", "\t", "\n\n"]:
        res = compile_amendment(blank, dummy_state, validate_rule)
        assert res["accepted"] is False
        assert res["category"] == "not_a_game_rule"
        assert "empty" in res["error"].lower()

def test_set_win_target_court_compilation_and_normalization():
    """'Set win target to 25' must normalize target to 'self' and pass validation."""
    rule = {
        "trigger": "win_check",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "set_win_target", "amount": 25, "target": "ignored"},
        "source": "Set win target to 25"
    }
    ok, err = validate_rule(rule)
    assert ok is True
    assert rule["effect"]["target"] == "self"
    
    # Also verify bounds
    for amount in [20, 65]:
        bad_rule = {
            "trigger": "win_check",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "set_win_target", "amount": amount, "target": "self"},
        }
        ok, err = validate_rule(bad_rule)
        assert ok is False
        assert f"set_win_target {amount} outside 21..64" in err

def test_boolean_type_rejection_in_validation():
    """Booleans must not pass as integers in amounts or predicate args."""
    bad_amount = {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "add_score", "amount": False, "target": "self"}
    }
    ok, err = validate_rule(bad_amount)
    assert ok is False
    assert "non-int effect.amount" in err

    bad_score_gt = {
        "trigger": "on_turn_start",
        "condition": {"mode": "all", "predicates": [{"name": "score_gt", "args": {"value": True}}]},
        "effect": {"type": "add_score", "amount": 2, "target": "self"}
    }
    ok, err = validate_rule(bad_score_gt)
    assert ok is False
    assert "score_gt requires args.value (int)" in err

# ---------------------------------------------------------------------------
# 4. SCORING, THEFT, CLAMPING & REROLL CONSERVATION
# ---------------------------------------------------------------------------

def test_pure_transfer_conservation_and_zero_theft():
    """Score theft transfers only available points, conserves sum of points, and never drops below 0."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1}
    s = create_game(settings, [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}])
    add_amendment(s, {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "steal_score", "amount": 3, "target": "last"},
        "source": "Steal 3 from last"
    })
    
    # Turn 1: P1 rolls 2. Score: P1=2, P2=0.
    # Last place is P2 (0 pts). Stealing 3 from P2 should steal min(3, 0) = 0.
    execute_turn(s, FixedRNG([2]))
    assert s["players"][0]["score"] == 2
    assert s["players"][1]["score"] == 0
    # Log shows stole 0
    steal_log = [e for e in s["log"] if e["effect"] == "steal_score"][0]
    assert "stole 0 from P2" in steal_log["details"]

    # Turn 2: P2 rolls 1. Dice gives P2 +1 (score 1).
    # Last place is P2 (self), so no-op.
    execute_turn(s, FixedRNG([1]))
    assert s["players"][1]["score"] == 1
