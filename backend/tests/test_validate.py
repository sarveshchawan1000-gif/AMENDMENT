"""Tests for validate.py — rule validation, clamps, max_rules, amend eligibility."""

import pytest
from engine.validate import (
    validate_rule, clamp_amount, clamp_win_target, check_max_rules, can_amend,
)
from conftest import make_rule, make_pred, FixedRNG


class TestValidateRule:
    """validate_rule returns (bool, error|None)."""

    def test_valid_rule(self):
        rule = make_rule("on_land", "add_score", 3, "self")
        ok, err = validate_rule(rule)
        assert ok and err is None

    def test_valid_rule_with_predicate(self):
        rule = make_rule("on_roll", "add_score", 2, "self",
                         predicates=[make_pred("roll_is_even")])
        ok, err = validate_rule(rule)
        assert ok and err is None

    def test_valid_score_gt(self):
        rule = make_rule("on_turn_start", "move", 2, "self",
                         predicates=[make_pred("score_gt", value=5)])
        ok, err = validate_rule(rule)
        assert ok and err is None

    def test_invalid_trigger(self):
        rule = make_rule("on_birthday", "add_score", 1, "self")
        ok, err = validate_rule(rule)
        assert not ok and "trigger" in err.lower()

    def test_invalid_effect_type(self):
        rule = make_rule("on_land", "explode", 1, "self")
        ok, err = validate_rule(rule)
        assert not ok and "effect.type" in err.lower()

    def test_invalid_target(self):
        rule = make_rule("on_land", "add_score", 1, "everyone")
        ok, err = validate_rule(rule)
        assert not ok and "target" in err.lower()

    def test_amount_exceeds_cap(self):
        rule = make_rule("on_land", "add_score", 6, "self")
        ok, err = validate_rule(rule)
        assert not ok and "5" in err

    def test_amount_below_cap(self):
        rule = make_rule("on_land", "add_score", -6, "self")
        ok, err = validate_rule(rule)
        assert not ok and "5" in err

    def test_set_win_target_below_min(self):
        rule = make_rule("win_check", "set_win_target", 3, "self")
        ok, err = validate_rule(rule)
        assert not ok and "5" in err

    def test_set_win_target_above_max(self):
        rule = make_rule("win_check", "set_win_target", 35, "self")
        ok, err = validate_rule(rule)
        assert not ok and "30" in err

    def test_set_win_target_at_boundary(self):
        for v in [5, 30]:
            rule = make_rule("win_check", "set_win_target", v, "self")
            ok, _ = validate_rule(rule)
            assert ok

    def test_missing_trigger(self):
        rule = {"condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}}
        ok, err = validate_rule(rule)
        assert not ok and "trigger" in err.lower()

    def test_missing_effect(self):
        rule = {"trigger": "on_land",
                "condition": {"mode": "all", "predicates": []}}
        ok, err = validate_rule(rule)
        assert not ok and "effect" in err.lower()

    def test_score_gt_missing_value(self):
        rule = make_rule("on_turn_start", "add_score", 1, "self",
                         predicates=[{"name": "score_gt"}])
        ok, err = validate_rule(rule)
        assert not ok and "score_gt" in err

    def test_invalid_predicate_name(self):
        rule = make_rule("on_land", "add_score", 1, "self",
                         predicates=[{"name": "is_awesome"}])
        ok, err = validate_rule(rule)
        assert not ok and "predicate" in err.lower()


class TestClamps:
    def test_clamp_amount_within(self):
        assert clamp_amount(0) == 0
        assert clamp_amount(3) == 3
        assert clamp_amount(-3) == -3

    def test_clamp_amount_over(self):
        assert clamp_amount(6) == 5
        assert clamp_amount(100) == 5

    def test_clamp_amount_under(self):
        assert clamp_amount(-6) == -5
        assert clamp_amount(-100) == -5

    def test_clamp_win_target_within(self):
        assert clamp_win_target(10) == 10
        assert clamp_win_target(15) == 15

    def test_clamp_win_target_low(self):
        assert clamp_win_target(3) == 5
        assert clamp_win_target(0) == 5

    def test_clamp_win_target_high(self):
        assert clamp_win_target(35) == 30
        assert clamp_win_target(100) == 30


class TestCheckMaxRules:
    def test_under_limit(self, game):
        # game has 1 rule (R2), max_rules=8
        assert check_max_rules(game) is True

    def test_at_limit(self, game):
        # Fill up to max_rules (8), R2 already = 1
        from engine.state import add_amendment
        for i in range(7):
            add_amendment(game, make_rule("on_land", "move", 1, "self"))
        assert len(game["rules"]) == 8
        assert check_max_rules(game) is False


class TestCanAmend:
    def test_draft_allowed(self, game):
        # game starts in drafting phase
        ok, _ = can_amend(game)
        assert ok

    def test_draft_rejected_after_first_roll(self, game):
        from engine.engine import execute_turn
        execute_turn(game, FixedRNG([3]))
        ok, err = can_amend(game)
        assert not ok
        assert "over" in err.lower()

    def test_live_allowed(self):
        from engine.state import create_game
        settings = {"board_size": 6, "dice_type": "1d6", "win_target": 10,
                    "mode": "live", "max_rules": 8, "amend_every": 1}
        state = create_game(settings, [{"id": "P1", "name": "A"},
                                        {"id": "P2", "name": "B"}])
        # moves_since_amend starts at 0, amend_every=1 → 0 >= 1 is False
        ok, _ = can_amend(state)
        assert not ok

        # Simulate one completed turn
        from engine.engine import execute_turn
        execute_turn(state, FixedRNG([3]))
        # moves_since_amend should be 1 now
        ok, _ = can_amend(state)
        assert ok

    def test_live_amend_every_2(self):
        from engine.state import create_game
        settings = {"board_size": 6, "dice_type": "1d6", "win_target": 10,
                    "mode": "live", "max_rules": 8, "amend_every": 2}
        state = create_game(settings, [{"id": "P1", "name": "A"},
                                        {"id": "P2", "name": "B"}])
        from engine.engine import execute_turn

        execute_turn(state, FixedRNG([3]))  # turn 0, moves_since_amend=1
        ok, _ = can_amend(state)
        assert not ok  # 1 < 2

        execute_turn(state, FixedRNG([3]))  # turn 1, moves_since_amend=2
        ok, _ = can_amend(state)
        assert ok  # 2 >= 2

    def test_hybrid_rejected(self):
        from engine.state import create_game
        rb = {"name": "test", "board_sizes": [6], "rules": []}
        settings = {"board_size": 6, "dice_type": "1d6", "win_target": 10,
                    "mode": "hybrid", "max_rules": 8, "amend_every": None}
        state = create_game(settings, [{"id": "P1", "name": "A"},
                                        {"id": "P2", "name": "B"}],
                            rulebook=rb)
        ok, err = can_amend(state)
        assert not ok
        assert "hybrid" in err.lower()

    def test_finished_rejected(self, game):
        from engine.engine import execute_turn
        from conftest import FixedRNG
        # Set win_target to 1 so first land wins
        game["settings"]["win_target"] = 1
        game["phase"] = "playing"
        execute_turn(game, FixedRNG([3]))
        ok, err = can_amend(game)
        assert not ok
        assert "finished" in err.lower()
