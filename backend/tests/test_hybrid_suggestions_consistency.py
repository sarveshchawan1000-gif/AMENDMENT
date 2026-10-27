"""
Regression and consistency tests for Hybrid Mode rule suggestions and Setup Screen parity.

Verifies:
1. Hybrid Mode predefined suggestions always originate from AMEND_001–AMEND_100.
2. Invalid fixtures AMEND_901–AMEND_904 are never returned as suggestions or in rulebooks.
3. Every suggested rule ID resolves to a valid canonical catalog entry in amendment_library.json.
4. Setup Screen preview data (/rulebooks, /rules/predefined) and gameplay suggestion data use
   the same canonical rule definitions.
5. No mismatches occur in rule IDs, descriptions, categories, conditions, or effects.
6. Existing custom AI Court amendments continue to work.
7. Existing deterministic selection and per-player duplicate-avoidance behavior remain intact.
8. Other game modes are not unintentionally changed.
"""

from unittest.mock import patch, Mock
import pytest
from fastapi.testclient import TestClient

from backend.app import app, games, load_rulebooks
from backend.engine.amendment_library import (
    get_amendment_by_id,
)
from backend.engine.suggestions import get_player_suggestions
from backend.engine.state import create_game


@pytest.fixture(autouse=True)
def reset_games():
    """Clear games storage before and after each test."""
    games.clear()
    yield
    games.clear()


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


def test_hybrid_mode_suggestions_from_canonical_library(client):
    """1. Hybrid Mode predefined suggestions always originate from AMEND_001–AMEND_100."""
    req_data = {
        "settings": {
            "board_size": 8,
            "dice_type": "1d6",
            "win_target": 30,
            "mode": "hybrid",
            "max_rules": 8,
            "rulebook_name": "prime-accords",
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    assert create_res.status_code == 201
    game_id = create_res.json()["game_id"]

    # Query suggestions for P1 and P2
    for pid in ["P1", "P2"]:
        res = client.get(f"/game/{game_id}/suggestions?player_id={pid}")
        assert res.status_code == 200
        suggestions = res.json()["suggestions"]
        assert len(suggestions) > 0

        for s in suggestions:
            rule_id = s["id"]
            # ID must strictly be AMEND_001 through AMEND_100
            assert rule_id.startswith("AMEND_")
            num = int(rule_id.split("_")[1])
            assert 1 <= num <= 100
            canon = get_amendment_by_id(rule_id)
            assert canon is not None
            assert canon["id"] == rule_id


def test_invalid_fixtures_never_returned(client):
    """2. Invalid fixtures AMEND_901–AMEND_904 are never returned as suggestions or in rulebooks."""
    # Check /rules/predefined
    predef_res = client.get("/rules/predefined")
    assert predef_res.status_code == 200
    predef_rules = predef_res.json()
    for r in predef_rules:
        assert not r["id"].startswith("AMEND_9")
        assert r["id"] not in ["AMEND_901", "AMEND_902", "AMEND_903", "AMEND_904"]

    # Check /rulebooks
    rb_res = client.get("/rulebooks")
    assert rb_res.status_code == 200
    rulebooks = rb_res.json()
    for rb in rulebooks:
        for r in rb["rules"]:
            rid = r.get("id")
            if rid:
                assert not rid.startswith("AMEND_9")

    # Check suggestion engine directly across multiple turns
    rulebook = load_rulebooks()[0]
    state = create_game(
        {"board_size": 8, "dice_type": "1d6", "win_target": 30, "mode": "hybrid", "max_rules": 8},
        [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
        rulebook=rulebook,
    )
    for turn in range(1, 10):
        state["turn"] = turn
        suggestions = get_player_suggestions(state, "P1", count=5)
        for s in suggestions:
            assert not s["id"].startswith("AMEND_9")


def test_every_suggested_rule_id_resolves_to_valid_catalog_entry(client):
    """3. Every suggested rule ID resolves to a valid canonical catalog entry."""
    req_data = {
        "settings": {
            "board_size": 10,
            "dice_type": "2d6",
            "win_target": 40,
            "mode": "hybrid",
            "max_rules": 8,
            "rulebook_name": "high-roller-charter",
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    res = client.get(f"/game/{game_id}/suggestions?player_id={create_res.json()['state']['players'][0]['id']}")
    assert res.status_code == 200
    for s in res.json()["suggestions"]:
        entry = get_amendment_by_id(s["id"])
        assert entry is not None
        assert entry["title"] == s["title"]
        assert entry["description"] == s["description"]
        assert entry["category"] == s["category"]


def test_setup_screen_and_gameplay_rule_definitions_match(client):
    """4 & 5. Setup Screen preview data and gameplay suggestion data use canonical definitions without mismatches."""
    # 1. Fetch rulebooks as Setup Screen does
    rb_res = client.get("/rulebooks")
    assert rb_res.status_code == 200
    rulebooks = rb_res.json()
    assert len(rulebooks) >= 3

    # Check each rulebook's rules match canonical catalog entries
    for rb in rulebooks:
        for rule in rb["rules"]:
            rule_id = rule.get("id")
            assert rule_id is not None
            assert rule_id.startswith("AMEND_")

            canon = get_amendment_by_id(rule_id)
            assert canon is not None, f"Rule {rule_id} in rulebook {rb['name']} not in catalog"

            # Fields must match canonical definition
            assert rule.get("title") == canon.get("title")
            assert rule.get("description") == canon.get("description")
            assert rule.get("category") == canon.get("category")

            # Condition and effect must match canonical rule_payload
            canon_payload = canon["rule_payload"]
            assert rule["trigger"] == canon_payload["trigger"]
            assert rule["condition"] == canon_payload["condition"]
            assert rule["effect"] == canon_payload["effect"]


def test_custom_ai_court_flow_continues_to_work(client):
    """6. Custom natural-language amendments continue to use the existing AI Court flow."""
    mock_rule_json = (
        '{"trigger": "on_land", '
        '"condition": {"mode": "all", "predicates": []}, '
        '"effect": {"type": "add_score", "amount": 2, "target": "self"}}'
    )

    with patch("backend.court.compiler.get_provider") as mock_get_provider:
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = mock_rule_json
        mock_get_provider.return_value = mock_provider

        response = client.post(
            "/court/compile",
            json={
                "text": "When you land on any tile, gain 2 points",
                "settings": {
                    "board_size": 6,
                    "dice_type": "1d6",
                    "win_target": 21,
                    "max_rules": 8,
                },
                "accepted_rules": [],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["accepted"] is True
        assert data["category"] == "accepted"
        assert data["rule"]["effect"]["amount"] == 2
        assert data["error"] is None


def test_deterministic_selection_and_duplicate_avoidance():
    """7. Existing deterministic selection and per-player duplicate-avoidance behavior remain intact."""
    rulebook = load_rulebooks()[0]
    state = create_game(
        {"board_size": 10, "dice_type": "1d6", "win_target": 30, "mode": "hybrid", "max_rules": 8},
        [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
        rulebook=rulebook,
    )
    state["turn"] = 2

    # Deterministic query on same turn yields identical results
    s_first = get_player_suggestions(state, "P1", count=4)
    s_repeat = get_player_suggestions(state, "P1", count=4)
    assert [s["id"] for s in s_first] == [s["id"] for s in s_repeat]

    # Different players receive different suggestion ordering / sets
    s_p2 = get_player_suggestions(state, "P2", count=4)
    assert [s["id"] for s in s_first] != [s["id"] for s in s_p2]

    # Next turn avoids immediately repeating suggested rules
    state["turn"] = 3
    s_next_turn = get_player_suggestions(state, "P1", count=4)
    # The set should have fresh items not identical to turn 2
    first_ids = {s["id"] for s in s_first}
    next_ids = {s["id"] for s in s_next_turn}
    assert first_ids != next_ids


def test_other_game_modes_not_unintentionally_changed(client):
    """8. Other game modes (live, draft) continue to work properly."""
    # Test Draft game creation
    draft_req = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "draft",
            "max_rules": 8,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    draft_res = client.post("/game/new", json=draft_req)
    assert draft_res.status_code == 201
    assert draft_res.json()["state"]["settings"]["mode"] == "draft"

    # Test Live game creation and roll
    live_req = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "live",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    live_res = client.post("/game/new", json=live_req)
    assert live_res.status_code == 201
    live_id = live_res.json()["game_id"]

    roll_res = client.post(f"/game/{live_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 200
    assert "roll" in roll_res.json()


def test_hybrid_mode_exposes_more_than_three_pairs(client):
    """Hybrid Mode exposes a substantially broader set of options than 3 fixed pairs."""
    rb_res = client.get("/rulebooks")
    assert rb_res.status_code == 200
    rulebooks = rb_res.json()
    # Now offers 9 distinct curated rulebooks
    assert len(rulebooks) >= 9

    predef_res = client.get("/rules/predefined")
    assert predef_res.status_code == 200
    predef_rules = predef_res.json()
    assert len(predef_rules) == 100


def test_hybrid_mode_custom_starting_rule_ids(client):
    """Players can choose custom starting rules from AMEND_001–AMEND_100 and they become active."""
    custom_ids = ["AMEND_012", "AMEND_016", "AMEND_020"]
    req = {
        "settings": {
            "board_size": 8,
            "dice_type": "1d6",
            "win_target": 30,
            "mode": "hybrid",
            "max_rules": 8,
            "starting_rule_ids": custom_ids,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    res = client.post("/game/new", json=req)
    assert res.status_code == 201
    game_data = res.json()
    game_id = game_data["game_id"]
    state = game_data["state"]

    active_rule_ids = [r["id"] for r in state["rules"]]
    assert active_rule_ids == custom_ids

    # Gameplay suggestions must exclude the active starting rules
    sugg_res = client.get(f"/game/{game_id}/suggestions?player_id=P1")
    assert sugg_res.status_code == 200
    suggested_ids = [s["id"] for s in sugg_res.json()["suggestions"]]
    for cid in custom_ids:
        assert cid not in suggested_ids


def test_hybrid_mode_rejects_invalid_starting_rule_fixtures(client):
    """Invalid test fixtures (AMEND_901) or unknown rule IDs are rejected with 400 Bad Request."""
    invalid_req = {
        "settings": {
            "board_size": 8,
            "dice_type": "1d6",
            "win_target": 30,
            "mode": "hybrid",
            "max_rules": 8,
            "starting_rule_ids": ["AMEND_901", "AMEND_001"],
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    res = client.post("/game/new", json=invalid_req)
    assert res.status_code == 400
    assert "Invalid rule fixture" in res.json()["detail"]
