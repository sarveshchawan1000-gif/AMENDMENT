"""Tests for state.py — create_game, rank_players, leaderboard, rulebook loading."""

import pytest
from engine.state import (
    create_game, rank_players, build_leaderboard,
    load_rulebook, select_rulebook, add_amendment,
)
from conftest import make_rule, make_game_with


# --- create_game --------------------------------------------------------------

class TestCreateGame:

    def test_structure(self, settings, players):
        s = create_game(settings, players)
        assert set(s.keys()) == {
            "game_id", "phase", "settings", "players", "current_player",
            "turn", "last_roll", "moves_since_amend", "rules", "log",
            "leaderboard", "winner", "rulebook_info",
        }

    def test_draft_starts_drafting(self):
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "draft", "max_rules": 8, "amend_every": None},
            [{"id": "P1", "name": "A"}],
        )
        assert s["phase"] == "drafting"

    def test_live_starts_playing(self):
        s = create_game(
            {"board_size": 8, "dice_type": "2d6", "win_target": 15,
             "mode": "live", "max_rules": 12, "amend_every": 1},
            [{"id": "P1", "name": "A"}, {"id": "P2", "name": "B"}],
        )
        assert s["phase"] == "playing"

    def test_hybrid_starts_playing(self):
        rb = {"name": "rb", "board_sizes": [8], "rules": []}
        s = create_game(
            {"board_size": 8, "dice_type": "1d6", "win_target": 10,
             "mode": "hybrid", "max_rules": 12, "amend_every": None},
            [{"id": "P1", "name": "A"}],
            rulebook=rb,
        )
        assert s["phase"] == "playing"

    def test_players_initialised(self, game):
        for p in game["players"]:
            assert p["position"] == 1
            assert p["score"] == 0
            assert p["skip_next"] is False

    def test_has_r2_immutable(self, game):
        r2 = game["rules"][0]
        assert r2["id"] == "R2"
        assert r2["trigger"] == "on_land"
        assert r2["effect"]["type"] == "add_score"
        assert r2["effect"]["amount"] == 1
        assert r2["effect"]["target"] == "self"
        assert r2["immutable"] is True

    def test_settings_copied(self, settings, players):
        s = create_game(settings, players)
        assert s["settings"] is not settings  # different object

    def test_initial_leaderboard(self, game):
        lb = game["leaderboard"]
        assert len(lb) == 3
        for entry in lb:
            assert entry["last_delta"] == 0
            assert entry["rank"] == 1  # all tied at 0

    def test_hybrid_requires_rulebook(self):
        with pytest.raises(ValueError, match="requires a rulebook"):
            create_game(
                {"board_size": 6, "dice_type": "1d6", "win_target": 10,
                 "mode": "hybrid", "max_rules": 8, "amend_every": None},
                [{"id": "P1", "name": "A"}],
            )

    def test_hybrid_rulebook_info_populated(self):
        rb = {"name": "testbook", "board_sizes": [6], "rules": [
            make_rule("on_land", "add_score", 2, "self"),
        ]}
        s = create_game(
            {"board_size": 6, "dice_type": "1d6", "win_target": 10,
             "mode": "hybrid", "max_rules": 8, "amend_every": None},
            [{"id": "P1", "name": "A"}],
            rulebook=rb,
        )
        assert s["rulebook_info"] is not None
        assert s["rulebook_info"]["name"] == "testbook"
        assert s["rulebook_info"]["loaded"] == 1


# --- rank_players -------------------------------------------------------------

class TestRankPlayers:

    def _players(self, scores):
        return [{"score": s} for s in scores]

    def test_no_ties(self):
        ranks = rank_players(self._players([10, 5, 3]))
        assert ranks == [1, 2, 3]

    def test_two_tied(self):
        ranks = rank_players(self._players([10, 5, 5, 3]))
        assert ranks == [1, 2, 2, 4]

    def test_all_tied(self):
        ranks = rank_players(self._players([5, 5, 5]))
        assert ranks == [1, 1, 1]

    def test_two_players_tied(self):
        ranks = rank_players(self._players([5, 5]))
        assert ranks == [1, 1]

    def test_single_player(self):
        ranks = rank_players(self._players([7]))
        assert ranks == [1]

    def test_descending_scores(self):
        # All different, should be 1,2,3
        ranks = rank_players(self._players([3, 7, 5]))
        assert ranks == [3, 1, 2]


# --- Leaderboard -------------------------------------------------------------

class TestLeaderboard:

    def test_initial_all_zero(self, game):
        lb = game["leaderboard"]
        for e in lb:
            assert e["last_delta"] == 0

    def test_preserves_other_deltas(self):
        players = [
            {"id": "P1", "name": "A", "score": 10},
            {"id": "P2", "name": "B", "score": 5},
        ]
        ranks = [1, 2]
        old = [
            {"player_id": "P1", "name": "A", "score": 8, "rank": 1, "last_delta": 3},
            {"player_id": "P2", "name": "B", "score": 5, "rank": 2, "last_delta": 0},
        ]
        lb = build_leaderboard(players, ranks, acting_idx=0,
                                acting_delta=2, old_leaderboard=old)
        assert lb[0]["last_delta"] == 2   # updated
        assert lb[1]["last_delta"] == 0   # preserved
        assert lb[0]["score"] == 10
        assert lb[1]["score"] == 5


# --- load_rulebook -----------------------------------------------------------

class TestLoadRulebook:

    def test_basic(self):
        rb = {"name": "rb", "board_sizes": [6], "rules": [
            make_rule("on_land", "add_score", 2, "self"),
            make_rule("on_roll", "move", 1, "self"),
        ]}
        rules, info = load_rulebook(rb, 6, 8)
        assert len(rules) == 2
        assert rules[0]["id"] == "A1"
        assert rules[1]["id"] == "A2"
        assert info["total_rules"] == 2
        assert info["filtered"] == 0
        assert info["truncated"] == 0
        assert info["loaded"] == 2

    def test_immutable_overridden_to_false(self):
        rb = {"name": "rb", "board_sizes": [], "rules": [
            make_rule("on_land", "add_score", 2, "self", immutable=True),
        ]}
        rules, info = load_rulebook(rb, 6, 8)
        assert rules[0]["immutable"] is False

    def test_truncate_to_max(self):
        rules_list = [make_rule("on_turn_start", "add_score", 1, "self")
                      for _ in range(10)]
        rb = {"name": "rb", "board_sizes": [], "rules": rules_list}
        rules, info = load_rulebook(rb, 6, 8)  # max_rules=8, available=7
        assert len(rules) == 7
        assert info["truncated"] == 3
        assert info["loaded"] == 7

    def test_empty_rules_valid(self):
        rb = {"name": "rb", "board_sizes": [6], "rules": []}
        rules, info = load_rulebook(rb, 6, 8)
        assert rules == []
        assert info["total_rules"] == 0
        assert info["filtered"] == 0
        assert info["truncated"] == 0
        assert info["loaded"] == 0

    def test_count_invariants(self):
        rules_list = [make_rule("on_land", "add_score", 1, "self")
                      for _ in range(5)]
        rb = {"name": "rb", "board_sizes": [], "rules": rules_list}
        rules, info = load_rulebook(rb, 6, 4)  # available = 3
        assert info["total_rules"] == info["filtered"] + info["truncated"] + info["loaded"]
        assert info["loaded"] <= 4 - 1  # max_rules - 1
        assert len(rules) == info["loaded"]

    def test_source_field_set(self):
        rb = {"name": "mybook", "board_sizes": [], "rules": [
            {"trigger": "on_land",
             "condition": {"mode": "all", "predicates": []},
             "effect": {"type": "add_score", "amount": 1, "target": "self"},
             "immutable": False},
        ]}
        rules, _ = load_rulebook(rb, 6, 8)
        assert "source" in rules[0]
        assert "mybook" in rules[0]["source"]

    def test_filter_currently_noop(self):
        # All rules pass the board-compatibility check (no tile refs)
        rb = {"name": "rb", "board_sizes": [], "rules": [
            make_rule("on_land", "add_score", 1, "self"),
            make_rule("on_roll", "move", 2, "leader"),
        ]}
        rules, info = load_rulebook(rb, 6, 8)
        assert info["filtered"] == 0
        assert len(rules) == 2


# --- select_rulebook ---------------------------------------------------------

class TestSelectRulebook:

    def test_picks_compatible(self):
        rbs = [
            {"name": "a", "board_sizes": [8], "rules": []},
            {"name": "b", "board_sizes": [6], "rules": []},
        ]
        from conftest import FixedRNG
        rng = FixedRNG([0])  # choice returns first element
        rb = select_rulebook(rbs, 6, rng)
        assert rb["name"] == "b"

    def test_empty_board_sizes_means_all(self):
        rbs = [{"name": "universal", "board_sizes": [], "rules": []}]
        from conftest import FixedRNG
        rb = select_rulebook(rbs, 10, FixedRNG([0]))
        assert rb["name"] == "universal"

    def test_no_compatible_raises(self):
        rbs = [{"name": "a", "board_sizes": [8], "rules": []}]
        from conftest import FixedRNG
        with pytest.raises(ValueError, match="No compatible rulebook"):
            select_rulebook(rbs, 6, FixedRNG([0]))

    def test_empty_list_raises(self):
        from conftest import FixedRNG
        with pytest.raises(ValueError, match="No compatible rulebook"):
            select_rulebook([], 6, FixedRNG([0]))


# --- add_amendment -----------------------------------------------------------

class TestAddAmendment:

    def test_basic(self, game):
        rule = make_rule("on_land", "add_score", 3, "self")
        ok, err = add_amendment(game, rule)
        assert ok and err is None
        assert len(game["rules"]) == 2  # R2 + amendment
        assert game["rules"][1]["id"] == "A1"
        assert game["rules"][1]["immutable"] is False

    def test_second_amendment(self, game):
        add_amendment(game, make_rule("on_land", "add_score", 2, "self"))
        add_amendment(game, make_rule("on_land", "move", 1, "self"))
        assert game["rules"][2]["id"] == "A2"

    def test_max_rules_rejected(self, game):
        # max_rules=8, R2 takes 1, so 7 amendments fit
        for i in range(7):
            add_amendment(game, make_rule("on_turn_start", "add_score", 1, "self"))
        assert len(game["rules"]) == 8
        ok, err = add_amendment(game, make_rule("on_turn_start", "add_score", 1, "self"))
        assert not ok
        assert "max" in err.lower()

    def test_invalid_rule_rejected(self, game):
        bad = make_rule("on_birthday", "add_score", 1, "self")
        ok, err = add_amendment(game, bad)
        assert not ok
