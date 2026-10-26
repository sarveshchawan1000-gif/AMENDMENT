"""Tests for engine.py — turn execution, effects, predicates, conflict, modes, logging."""

from engine.engine import (
    execute_turn,
    _get_active_rules,
    get_rule_conflict_key,
    normalize_condition,
    normalize_predicate,
)
from engine.state import create_game, add_amendment
from engine.validate import can_amend
from conftest import make_rule, make_pred, make_game_with, FixedRNG


# --- Helpers for this file ----------------------------------------------------

def make_game3(scores=None, positions=None, rules=None, **kw):
    """3-player game in 'playing' phase."""
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 10,
                "mode": "draft", "max_rules": 8, "amend_every": None}
    settings.update(kw)
    pl = [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"},
          {"id": "P3", "name": "C"}]
    s = create_game(settings, pl)
    s["phase"] = "playing"
    if scores:
        for i, v in enumerate(scores):
            s["players"][i]["score"] = v
    if positions:
        for i, v in enumerate(positions):
            s["players"][i]["position"] = v
    if rules:
        for r in rules:
            add_amendment(s, r)
    return s


def add_raw(state, rule, rid=None, immutable=False):
    """Add a rule bypassing validation (for testing clamps / immutables)."""
    r = dict(rule)
    r["id"] = rid or f"R{len(state['rules'])}"
    r["immutable"] = immutable
    r.setdefault("source", "test")
    state["rules"].append(r)
    return state


def run(state, rolls=None):
    """Execute a turn with a FixedRNG."""
    return execute_turn(state, FixedRNG(rolls or [3]))


# === MOVE EFFECTS ============================================================

class TestMoveEffects:

    def test_move_wraparound(self):
        s = make_game_with(positions=[36, 1])
        run(s, [3])  # P1 at 36 + 3 = 39 → wraps to 3
        assert s["players"][0]["position"] == 3

    def test_move_on_roll_self_adjustment(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "move", 2, "self"),
        ])
        run(s, [3])  # roll 3 + adjustment 2 = total 5; 1→6
        assert s["players"][0]["position"] == 6

    def test_move_on_roll_other_targets_reposition(self):
        s = make_game_with(positions=[1, 10], rules=[
            make_rule("on_roll", "move", 2, "all_others"),
        ])
        run(s, [3])  # P1 rolls; P2 repositioned 10→12
        assert s["players"][1]["position"] == 12
        assert s["players"][0]["position"] == 4  # normal dice move 1+3=4

    def test_move_on_land_no_retrigger(self):
        s = make_game_with(rules=[
            make_rule("on_land", "move", 2, "self"),
        ])
        run(s, [3])  # 1→4 (dice), then 4→6 (amendment). Roll 3 gives 3 points.
        assert s["players"][0]["position"] == 6
        assert s["players"][0]["score"] == 3  # dice roll 3

    def test_move_zero_net_stays(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "move", -3, "self"),
        ])
        run(s, [3])  # roll 3 + adj -3 = 0; stays at 1
        assert s["players"][0]["position"] == 1
        assert s["players"][0]["score"] == 3  # dice roll 3

    def test_move_negative_total(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "move", -5, "self"),
        ])
        run(s, [2])  # roll 2 + adj -5 = -3; 1-3 = -2 → wraps to 34
        assert s["players"][0]["position"] == 34


# === ADD_SCORE ===============================================================

class TestAddScore:

    def test_add_score_positive(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 3, "self"),
        ])
        run(s, [3])  # roll 3, amendment +3 → score 6
        assert s["players"][0]["score"] == 6

    def test_add_score_negative_floors_at_zero(self):
        s = make_game_with(scores=[5, 0], rules=[
            make_rule("on_land", "add_score", -3, "self"),
        ])
        run(s, [3])  # roll 3 (5→8), amendment -3 (8→5)
        assert s["players"][0]["score"] == 5

    def test_add_score_floors_at_zero_from_zero(self):
        s = make_game_with(scores=[0, 0], rules=[
            make_rule("on_land", "add_score", -3, "self"),
        ])
        run(s, [3])  # roll 3 (0→3), amendment -3 (3→0)
        assert s["players"][0]["score"] == 0

    def test_add_score_cap(self):
        s = make_game_with()
        add_raw(s, make_rule("on_land", "add_score", 10, "self"))  # bypass validation
        run(s, [3])  # roll 3, amendment clamped to +5 → score 8
        assert s["players"][0]["score"] == 8

    def test_add_score_multi_target_leader(self):
        s = make_game3(scores=[5, 5, 5], rules=[
            make_rule("on_turn_start", "add_score", 2, "leader"),
        ])
        run(s, [3])  # all tied at 5 → all leaders → all get +2
        assert s["players"][0]["score"] == 5 + 2 + 3  # +2 (leader) +3 (roll)
        assert s["players"][1]["score"] == 5 + 2
        assert s["players"][2]["score"] == 5 + 2


# === STEAL_SCORE =============================================================

class TestStealScore:

    def test_steal_score_basic(self):
        s = make_game_with(scores=[5, 5], rules=[
            make_rule("on_land", "steal_score", 3, "all_others"),
        ])
        run(s, [3])  # roll 3 (5→8), steal 3 from P2: P1 8→11, P2 5→2
        assert s["players"][0]["score"] == 11
        assert s["players"][1]["score"] == 2

    def test_steal_score_floor_at_zero(self):
        s = make_game_with(scores=[0, 2], rules=[
            make_rule("on_land", "steal_score", 5, "all_others"),
        ])
        run(s, [3])  # roll 3 (0→3), steal min(5,2)=2: P1 3→5, P2 2→0
        assert s["players"][0]["score"] == 5
        assert s["players"][1]["score"] == 0

    def test_steal_score_self_target_noop(self):
        s = make_game_with(scores=[5, 5], rules=[
            make_rule("on_land", "steal_score", 3, "self"),
        ])
        run(s, [3])  # roll 3 (5→8), steal self = no-op
        assert s["players"][0]["score"] == 8
        assert s["players"][1]["score"] == 5

    def test_steal_score_tied_targets(self):
        s = make_game3(scores=[10, 3, 3], rules=[
            make_rule("on_land", "steal_score", 2, "last"),
        ])
        run(s, [3])  # roll 3 (10→13), steal from first last by index (P2, idx 1)
        assert s["players"][0]["score"] == 13 + 2  # +3 roll +2 steal
        assert s["players"][1]["score"] == 3 - 2    # stolen from
        assert s["players"][2]["score"] == 3        # not stolen from


# === SKIP_TURN ===============================================================

class TestSkipTurn:

    def test_skip_turn_consumed_next_turn(self):
        s = make_game_with(scores=[0, 0], rules=[
            make_rule("on_land", "skip_turn", 0, "all_others"),
        ])
        run(s, [3])  # P1 lands, R2 +1, P2 skip_next=True
        assert s["players"][1]["skip_next"] is True
        assert s["current_player"] == 1  # P2's turn now

        run(s, [3])  # P2 is skipped, advances to P1
        assert s["players"][1]["skip_next"] is False
        assert s["current_player"] == 0  # back to P1


# === REROLL ==================================================================

class TestReroll:

    def test_reroll_replaces_roll(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "reroll", 0, "self"),
        ])
        run(s, [3, 6])  # initial roll 3, reroll 6
        assert s["last_roll"] == 6
        # P1 moves 1+6=7
        assert s["players"][0]["position"] == 7

    def test_reroll_no_chain(self):
        s = make_game_with()
        add_raw(s, make_rule("on_roll", "reroll", 0, "self"))
        add_raw(s, make_rule("on_roll", "reroll", 0, "self"))
        run(s, [3, 6])  # first reroll fires (3→6), second is no-op
        assert s["last_roll"] == 6
        # Only one reroll consumed; second was no-op

    def test_reroll_no_reexecute(self):
        # Amendment 1: on_roll, add_score +1, condition roll_is_even
        # Amendment 2: on_roll, reroll
        # Roll 3 (odd) → amendment 1 skips. Reroll to 4 (even).
        # Amendment 1 does NOT re-fire.
        s = make_game_with(rules=[
            make_rule("on_roll", "add_score", 1, "self",
                      predicates=[make_pred("roll_is_even")]),
            make_rule("on_roll", "reroll", 0, "self"),
        ])
        run(s, [3, 4])  # roll 3, reroll 4
        # P1 score: reroll 4 sets score to 4
        assert s["players"][0]["score"] == 4


# === SET_WIN_TARGET ==========================================================

class TestSetWinTarget:

    def test_set_win_target_immediate(self):
        s = make_game_with(win_target=25, rules=[
            make_rule("win_check", "set_win_target", 30, "self"),
        ])
        run(s, [3])
        assert s["settings"]["win_target"] == 30

    def test_set_win_target_clamp_low(self):
        s = make_game_with()
        add_raw(s, make_rule("win_check", "set_win_target", 3, "self"))
        run(s, [3])
        assert s["settings"]["win_target"] == 21

    def test_set_win_target_clamp_high(self):
        s = make_game_with()
        add_raw(s, make_rule("win_check", "set_win_target", 100, "self"))
        run(s, [3])
        assert s["settings"]["win_target"] == 64


# === MAX_RULES ===============================================================

class TestMaxRules:

    def test_max_rules_enforced(self):
        s = make_game_with(max_rules=3)
        ok1, _ = add_amendment(s, make_rule("on_turn_start", "add_score", 1, "self"))
        ok2, _ = add_amendment(s, make_rule("on_turn_start", "move", 1, "self"))
        ok3, _ = add_amendment(s, make_rule("on_turn_start", "skip_turn", 0, "self"))
        ok4, _ = add_amendment(s, make_rule("on_turn_start", "move", 2, "self"))
        assert ok1 and ok2 and ok3
        assert not ok4  # rejected at max
        assert len(s["rules"]) == 3


# === CONFLICT RESOLUTION =====================================================

class TestConflictResolution:

    # 1. Prime tile +2 and always +1 coexist (Case A)
    def test_different_conditions_coexist_prime_and_always(self):
        rule_prime = make_rule("on_land", "add_score", 2, "self",
                               predicates=[make_pred("tile_is_prime")])
        rule_always = make_rule("on_land", "add_score", 1, "self",
                                predicates=[])
        s = make_game_with(rules=[rule_prime, rule_always])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 2
        active_ids = [r["id"] for _, r in active]
        assert s["rules"][0]["id"] in active_ids
        assert s["rules"][1]["id"] in active_ids

    # 2. Landing on a prime tile applies both rules and awards +3
    def test_landing_on_prime_applies_both_rules(self):
        # Position 1 + roll 1 = position 2 (prime).
        rule_prime = make_rule("on_land", "add_score", 2, "self",
                               predicates=[make_pred("tile_is_prime")])
        rule_always = make_rule("on_land", "add_score", 1, "self",
                                predicates=[])
        s = make_game_with(rules=[rule_prime, rule_always])
        run(s, [1])
        # P1: roll 1 + prime rule (+2) + always rule (+1) = 4 (rules awarded +3)
        assert s["players"][0]["position"] == 2
        assert s["players"][0]["score"] == 4
        # Verify both rules produced log entries
        rule_ids = {s["rules"][0]["id"], s["rules"][1]["id"]}
        fired_ids = {entry["rule_id"] for entry in s["log"] if entry.get("rule_id") in rule_ids}
        assert fired_ids == rule_ids

    # 3. Landing on a non-prime tile applies only the always +1 rule
    def test_landing_on_non_prime_applies_only_always(self):
        # Position 1 + roll 3 = position 4 (not prime).
        rule_prime = make_rule("on_land", "add_score", 2, "self",
                               predicates=[make_pred("tile_is_prime")])
        rule_always = make_rule("on_land", "add_score", 1, "self",
                                predicates=[])
        s = make_game_with(rules=[rule_prime, rule_always])
        run(s, [3])
        # P1: roll 3 + always rule (+1) = 4; prime rule did NOT fire
        assert s["players"][0]["position"] == 4
        assert s["players"][0]["score"] == 4
        fired_ids = [entry["rule_id"] for entry in s["log"] if entry.get("rule_id")]
        assert s["rules"][1]["id"] in fired_ids
        assert s["rules"][0]["id"] not in fired_ids

    # 4. Same condition, different amounts: replace (Case B)
    def test_same_condition_different_amounts_replace(self):
        rule_old = make_rule("on_land", "add_score", 2, "self",
                             predicates=[make_pred("tile_is_prime")])
        rule_new = make_rule("on_land", "add_score", 3, "self",
                             predicates=[make_pred("tile_is_prime")])
        s = make_game_with(rules=[rule_old, rule_new])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 1
        assert active[0][1]["id"] == s["rules"][1]["id"]  # only newer rule

        run(s, [1])  # lands on prime tile 2
        # roll 1 + newer rule (+3) = 4 (must not be 1 + 2 + 3 = 6)
        assert s["players"][0]["score"] == 4
        fired_ids = [entry["rule_id"] for entry in s["log"] if entry.get("rule_id")]
        assert s["rules"][1]["id"] in fired_ids
        assert s["rules"][0]["id"] not in fired_ids

    # 5. Same condition, opposite amounts: replace (Case C)
    def test_same_condition_opposite_amounts_replace(self):
        rule_old = make_rule("on_land", "add_score", 2, "self",
                             predicates=[make_pred("tile_is_prime")])
        rule_new = make_rule("on_land", "add_score", -2, "self",
                             predicates=[make_pred("tile_is_prime")])
        s = make_game_with(scores=[5, 0], rules=[rule_old, rule_new])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 1
        assert active[0][1]["id"] == s["rules"][1]["id"]  # only newer rule

        run(s, [1])  # lands on prime tile 2
        # initial 5 + roll 1 + newer rule (-2) = 4 (if both were active, +2 and -2 cancel to 6)
        assert s["players"][0]["score"] == 4
        fired_ids = [entry["rule_id"] for entry in s["log"] if entry.get("rule_id")]
        assert s["rules"][1]["id"] in fired_ids
        assert s["rules"][0]["id"] not in fired_ids

    # 6. tile_is_prime and roll_is_even coexist when effect signatures match
    def test_different_predicates_coexist_same_effect_and_target(self):
        rule_prime = make_rule("on_land", "add_score", 2, "self",
                               predicates=[make_pred("tile_is_prime")])
        rule_even = make_rule("on_land", "add_score", 2, "self",
                              predicates=[make_pred("roll_is_even")])
        s = make_game_with(rules=[rule_prime, rule_even])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 2

        # Roll 2: even roll (2%2==0) AND 1 + 2 = tile 3 (prime)
        run(s, [2])
        # P1: roll 2 + prime rule (+2) + even roll rule (+2) = 6
        assert s["players"][0]["position"] == 3
        assert s["players"][0]["score"] == 6

    # 7. Equivalent normalized conditions conflict deterministically
    def test_equivalent_normalized_conditions_conflict_deterministically(self):
        # (a) Normalization equivalence checks
        # Predicate arg order independence
        p1 = {"name": "score_gt", "args": {"value": 5, "secondary": 10}}
        p2 = {"name": "score_gt", "args": {"secondary": 10, "value": 5}}
        assert normalize_predicate(p1) == normalize_predicate(p2)

        # Predicate order independence under 'all'
        c_all_1 = {"mode": "all", "predicates": [make_pred("tile_is_prime"), make_pred("is_leader")]}
        c_all_2 = {"mode": "all", "predicates": [make_pred("is_leader"), make_pred("tile_is_prime")]}
        assert normalize_condition(c_all_1) == normalize_condition(c_all_2)

        # Single predicate equivalence between 'all' and 'any'
        c_single_all = {"mode": "all", "predicates": [make_pred("tile_is_prime")]}
        c_single_any = {"mode": "any", "predicates": [make_pred("tile_is_prime")]}
        assert normalize_condition(c_single_all) == normalize_condition(c_single_any)

        # Redundant duplicate predicates normalize identically
        c_dup = {"mode": "all", "predicates": [make_pred("tile_is_prime"), make_pred("tile_is_prime")]}
        assert normalize_condition(c_dup) == normalize_condition(c_single_all)

        # Empty representations normalize identically to ("always", ())
        assert normalize_condition(None) == ("always", ())
        assert normalize_condition({}) == ("always", ())
        assert normalize_condition({"predicates": []}) == ("always", ())

        # (b) Deterministic conflict resolution in engine
        r1 = make_rule("on_land", "add_score", 2, "self",
                       predicates=[make_pred("tile_is_prime"), make_pred("is_leader")], mode="all")
        # r2 has reversed predicate order and different amount
        r2 = make_rule("on_land", "add_score", 3, "self",
                       predicates=[make_pred("is_leader"), make_pred("tile_is_prime")], mode="all")
        s = make_game_with(rules=[r1, r2])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 1
        assert active[0][1]["id"] == s["rules"][1]["id"]

    # 8. Rules with different effect types coexist (Case D)
    def test_different_effect_types_coexist(self):
        rule_score = make_rule("on_land", "add_score", 2, "self",
                               predicates=[make_pred("tile_is_prime")])
        rule_move = make_rule("on_land", "move", 3, "self",
                              predicates=[make_pred("tile_is_prime")])
        s = make_game_with(rules=[rule_score, rule_move])
        matching = [(i, r) for i, r in enumerate(s["rules"]) if r["trigger"] == "on_land"]
        active = _get_active_rules(matching)
        assert len(active) == 2

        # Roll 1 -> lands on tile 2 (prime)
        run(s, [1])
        # P1: roll 1 + score rule (+2) = 3
        # AND move rule moves player 3 spaces: 2 -> 5
        assert s["players"][0]["score"] == 3
        assert s["players"][0]["position"] == 5

    # 9. Existing behavior preserved
    def test_different_targets_coexist(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 1, "self"),
            make_rule("on_land", "add_score", 1, "all_others"),
        ])
        run(s, [3])
        # roll 3 + amendment1 (+1 self) → P1=4
        # amendment2 (+1 all_others) → P2=1
        assert s["players"][0]["score"] == 4
        assert s["players"][1]["score"] == 1

    def test_same_target_newer_wins(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 2, "self"),
            make_rule("on_land", "add_score", 3, "self"),
        ])
        run(s, [3])
        # roll 3 + newer amendment (+3) = 6; older (+2) suppressed
        assert s["players"][0]["score"] == 6

    def test_immutable_not_overridden(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 3, "self"),
        ])
        run(s, [3])
        # roll 3 + amendment +3 → 6
        assert s["players"][0]["score"] == 6

    def test_immutable_stacks(self):
        s = make_game_with()
        # Add a custom immutable rule directly
        add_raw(s, make_rule("on_turn_start", "add_score", 2, "self"),
                rid="IMM1", immutable=True)
        add_amendment(s, make_rule("on_turn_start", "add_score", 3, "self"))
        run(s, [3])
        # on_turn_start: IMM1 +2 and A1 +3 both fire (immutable stacks) → 5
        # roll 3 → total 8
        assert s["players"][0]["score"] == 8


# === DICE ROLL SCORING =======================================================

class TestDiceRollScoring:

    def test_dice_roll_scores_points(self):
        s = make_game_with()
        run(s, [3])
        assert s["players"][0]["score"] == 3  # roll 3 gives 3 points

    def test_dice_roll_scores_each_turn(self):
        s = make_game_with()
        run(s, [3])  # P1 turn: roll 3 → score 3
        run(s, [4])  # P2 turn: roll 4 → score 4
        run(s, [2])  # P1 turn: roll 2 → score 3 + 2 = 5
        assert s["players"][0]["score"] == 5
        assert s["players"][1]["score"] == 4


# === WIN CHECK ===============================================================

class TestWinCheck:

    def test_win_check_sets_winner(self):
        s = make_game_with(win_target=3)
        run(s, [3])  # roll 3 >= win_target 3
        assert s["winner"] == "P1"
        assert s["phase"] == "finished"

    def test_win_turn_finalization(self):
        # score_at_turn_start = 0; on_turn_start +1, roll 3 → final 4
        # win_target = 4 → wins. last_delta = 4-0 = 4
        # turn/moves/current_player NOT incremented/advanced
        s = make_game_with(win_target=4, rules=[
            make_rule("on_turn_start", "add_score", 1, "self"),
        ])
        turn_before = s["turn"]
        moves_before = s["moves_since_amend"]
        cp_before = s["current_player"]
        run(s, [3])
        # score = 0 + 1 (turn_start) + 3 (roll) = 4 >= 4 → win
        assert s["winner"] == "P1"
        assert s["phase"] == "finished"
        # last_delta includes all effects (on_turn_start + roll)
        lb = [e for e in s["leaderboard"] if e["player_id"] == "P1"][0]
        assert lb["last_delta"] == 4
        # NOT incremented / advanced
        assert s["turn"] == turn_before
        assert s["moves_since_amend"] == moves_before
        assert s["current_player"] == cp_before


# === PREDICATES ==============================================================

class TestPredicates:

    def test_is_leader_true(self):
        s = make_game_with(scores=[10, 5], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("is_leader")]),
        ])
        run(s, [3])  # P1 is leader → +1, then roll 3 → 14
        assert s["players"][0]["score"] == 14

    def test_is_leader_false(self):
        s = make_game_with(scores=[3, 10], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("is_leader")]),
        ])
        run(s, [3])  # P1 is NOT leader → no +1, only roll 3 → 6
        assert s["players"][0]["score"] == 6

    def test_is_last_true(self):
        s = make_game_with(scores=[3, 10], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("is_last")]),
        ])
        run(s, [3])  # P1 is last → +1, then roll 3 → 7
        assert s["players"][0]["score"] == 7

    def test_is_last_false(self):
        s = make_game_with(scores=[10, 3], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("is_last")]),
        ])
        run(s, [3])  # P1 is NOT last → no +1, only roll 3 → 13
        assert s["players"][0]["score"] == 13

    def test_roll_is_even(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "add_score", 2, "self",
                      predicates=[make_pred("roll_is_even")]),
        ])
        run(s, [4])  # roll 4 is even → roll 4 + 2 = 6
        assert s["players"][0]["score"] == 6

    def test_roll_is_odd(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "add_score", 2, "self",
                      predicates=[make_pred("roll_is_even")]),
        ])
        run(s, [3])  # roll 3 is odd → no +2, only roll 3 → 3
        assert s["players"][0]["score"] == 3

    def test_tile_is_prime(self):
        s = make_game_with()
        run(s, [2])  # 1+2=3, tile 3 is prime
        assert s["players"][0]["position"] == 3
        # Add amendment and rerun
        s2 = make_game_with(rules=[
            make_rule("on_land", "add_score", 1, "all_others",
                      predicates=[make_pred("tile_is_prime")]),
        ])
        run(s2, [2])  # P1 lands on 3 (prime) → P2 gets +1
        assert s2["players"][1]["score"] == 1

    def test_score_gt(self):
        s = make_game_with(scores=[5, 0], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("score_gt", value=3)]),
        ])
        run(s, [3])  # P1 score 5 > 3 → +1, then roll 3 → 9
        assert s["players"][0]["score"] == 9

    def test_score_gt_false(self):
        s = make_game_with(scores=[2, 0], rules=[
            make_rule("on_turn_start", "add_score", 1, "self",
                      predicates=[make_pred("score_gt", value=3)]),
        ])
        run(s, [3])  # P1 score 2 not > 3 → no +1, only roll 3 → 5
        assert s["players"][0]["score"] == 5


# === TURN ORDER ==============================================================

class TestTurnOrder:

    def test_on_turn_start_before_roll(self):
        # roll_is_even at on_turn_start → False (no roll yet)
        s = make_game_with(rules=[
            make_rule("on_turn_start", "add_score", 5, "self",
                       predicates=[make_pred("roll_is_even")]),
        ])
        run(s, [4])  # on_turn_start has no roll → predicate False → no +5
        assert s["players"][0]["score"] == 4  # only roll 4

    def test_full_turn_order(self):
        s = make_game_with(rules=[
            make_rule("on_turn_start", "add_score", 1, "self"),
            make_rule("on_roll", "move", 1, "self"),
            make_rule("on_land", "skip_turn", 0, "all_others"),
            make_rule("win_check", "set_win_target", 25, "self"),
        ])
        run(s, [3])
        # on_turn_start: +1 → score 1
        # roll: 3 → score 4
        # on_roll: move adjustment +1 → total 4, 1→5
        # on_land: skip P2
        # win_check: win_target → 25
        assert s["players"][0]["score"] == 4
        assert s["players"][0]["position"] == 5  # 1 + (3 + 1) = 5
        assert s["players"][1]["skip_next"] is True
        assert s["settings"]["win_target"] == 25
        # Verify log order
        ids = [e["rule_id"] for e in s["log"]]
        assert ids == ["A1", "A2", "A3", "A4"]


# === NO CHAINED EFFECTS ======================================================

class TestNoChainedEffects:

    def test_on_land_move_no_retrigger(self):
        s = make_game_with(rules=[
            make_rule("on_land", "move", 3, "self"),
        ])
        run(s, [3])  # 1→4 (dice), then 4→7 (amendment). Roll 3 gives 3 points.
        assert s["players"][0]["score"] == 3

    def test_rule_fires_once_per_phase(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 1, "self"),
        ])
        run(s, [3])
        # R2 +1, amendment +1 → score 2. Amendment fires exactly once.
        amend_logs = [e for e in s["log"] if e["rule_id"] == "A1"]
        assert len(amend_logs) == 1


# === LOGGING =================================================================

class TestLogging:

    def test_log_format(self):
        s = make_game_with(rules=[
            make_rule("on_land", "add_score", 2, "self"),
        ])
        run(s, [3])
        assert len(s["log"]) >= 1  # amendment
        for entry in s["log"]:
            assert set(entry.keys()) == {
                "turn", "player", "rule_id", "effect",
                "before", "after", "details",
            }
            assert entry["turn"] == 0
            assert entry["player"] == "P1"

    def test_log_details_move(self):
        s = make_game_with(rules=[
            make_rule("on_land", "move", 2, "self"),
        ])
        run(s, [3])
        move_log = [e for e in s["log"] if e["effect"] == "move"]
        assert len(move_log) == 1
        assert "pos" in move_log[0]["details"]

    def test_log_details_reroll(self):
        s = make_game_with(rules=[
            make_rule("on_roll", "reroll", 0, "self"),
        ])
        run(s, [3, 6])
        reroll_log = [e for e in s["log"] if e["effect"] == "reroll"]
        assert len(reroll_log) == 1
        assert "3→6" in reroll_log[0]["details"]

    def test_log_details_set_win_target(self):
        s = make_game_with(rules=[
            make_rule("win_check", "set_win_target", 25, "self"),
        ])
        run(s, [3])
        swt_log = [e for e in s["log"] if e["effect"] == "set_win_target"]
        assert len(swt_log) == 1
        assert "win_target" in swt_log[0]["details"]

    def test_log_details_steal(self):
        s = make_game_with(scores=[5, 5], rules=[
            make_rule("on_land", "steal_score", 3, "all_others"),
        ])
        run(s, [3])
        steal_log = [e for e in s["log"] if e["effect"] == "steal_score"]
        assert len(steal_log) == 1
        assert "stole" in steal_log[0]["details"]


# === LAST_DELTA ==============================================================

class TestLastDelta:

    def test_initial_zero(self, game):
        for e in game["leaderboard"]:
            assert e["last_delta"] == 0

    def test_last_delta_net_turn(self):
        # on_turn_start +1, roll 3 (+3), amendment +2 → net 6
        s = make_game_with(rules=[
            make_rule("on_turn_start", "add_score", 1, "self"),
            make_rule("on_land", "add_score", 2, "self"),
        ])
        run(s, [3])
        lb = [e for e in s["leaderboard"] if e["player_id"] == "P1"][0]
        # score = 0 + 1 + 3 + 2 = 6, last_delta = 6 - 0 = 6
        assert lb["last_delta"] == 6


# === SKIP TURN COUNTERS ======================================================

class TestSkipCounters:

    def test_skip_increments_turn_not_moves(self):
        s = make_game_with(mode="live", amend_every=1)
        s["players"][0]["skip_next"] = True
        turn_before = s["turn"]
        moves_before = s["moves_since_amend"]
        run(s, [3])  # P1 skipped
        assert s["turn"] == turn_before + 1
        assert s["moves_since_amend"] == moves_before  # unchanged
        assert s["current_player"] == 1  # advanced to P2

    def test_skip_last_delta_zero(self):
        s = make_game_with(scores=[5, 3])
        s["players"][0]["skip_next"] = True
        run(s, [3])  # P1 skipped
        lb = [e for e in s["leaderboard"] if e["player_id"] == "P1"][0]
        assert lb["last_delta"] == 0


# === MODES ===================================================================

class TestModes:

    def test_draft_mode_amendments(self):
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "draft", "max_rules": 8, "amend_every": None},
            [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"}],
        )
        assert s["phase"] == "drafting"
        ok, _ = can_amend(s)
        assert ok
        run(s, [3])  # first roll → transitions to playing
        assert s["phase"] == "playing"
        ok, err = can_amend(s)
        assert not ok

    def test_live_mode_amend_every_1(self):
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "live", "max_rules": 8, "amend_every": 1},
            [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"}],
        )
        ok, _ = can_amend(s)
        assert not ok  # moves_since_amend=0 < 1
        run(s, [3])  # P1 turn
        assert s["moves_since_amend"] == 1
        ok, _ = can_amend(s)
        assert ok  # 1 >= 1

    def test_live_mode_amend_every_2(self):
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "live", "max_rules": 8, "amend_every": 2},
            [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"}],
        )
        run(s, [3])  # turn 0 → moves_since_amend=1
        assert s["moves_since_amend"] == 1
        ok, _ = can_amend(s)
        assert not ok  # 1 < 2
        run(s, [3])  # turn 1 → moves_since_amend=2
        assert s["moves_since_amend"] == 2
        ok, _ = can_amend(s)
        assert ok  # 2 >= 2

    def test_hybrid_mode_no_amendments(self):
        rb = {"name": "rb", "board_sizes": [6], "rules": []}
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "hybrid", "max_rules": 8, "amend_every": None},
            [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"}],
            rulebook=rb,
        )
        ok, err = can_amend(s)
        assert not ok
        assert "hybrid" in err.lower()


# === MULTI-TARGET MAX IMPACT =================================================

class TestMultiTargetMaxImpact:

    def test_three_leaders_each_get_five(self):
        s = make_game3(scores=[5, 5, 5], rules=[
            make_rule("on_turn_start", "add_score", 5, "leader"),
        ])
        run(s, [3])
        # All 3 tied at 5 → all leaders → each gets +5
        # P1: 5+5 (leader) +3 (roll) = 13
        # P2: 5+5 = 10
        # P3: 5+5 = 10
        assert s["players"][0]["score"] == 13
        assert s["players"][1]["score"] == 10
        assert s["players"][2]["score"] == 10

    def test_negative_floors_at_zero(self):
        s = make_game3(scores=[2, 2, 2], rules=[
            make_rule("on_turn_start", "add_score", -5, "leader"),
        ])
        run(s, [3])
        # All at 2 → all leaders → each gets max(0, 2+(-5))=0
        # Then P1 rolls 3 → score 3
        assert s["players"][0]["score"] == 3
        assert s["players"][1]["score"] == 0
        assert s["players"][2]["score"] == 0
