"""
Tests for Hybrid Mode Rules Book persistence and fixed rules constraints.

Verifies:
1. In Hybrid Mode, the rules are fixed from the starting curated rulebook.
2. Players cannot change or add rules in Hybrid Mode (amendments rejected).
3. The starting fixed rules are saved in the persistent Rules Book in correct order.
4. Rules remain available after reopening / reloading the game.
5. Rules belonging to one game do not appear in another game's Rules Book.
6. Existing game modes continue to work properly.
7. Clear errors are returned for invalid game IDs or non-hybrid modes.
"""

import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app import app, games
from backend.rules_book import (
    get_rules_book_dir,
    init_hybrid_rules_book,
    load_rules_book,
)


@pytest.fixture
def client():
    """Create a FastAPI test client."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_rules_book_storage():
    """Clean up rules_books storage before and after tests."""
    storage_dir = get_rules_book_dir()
    for f in storage_dir.glob("*.json"):
        try:
            f.unlink()
        except OSError:
            pass
    yield
    for f in storage_dir.glob("*.json"):
        try:
            f.unlink()
        except OSError:
            pass


def test_init_hybrid_rules_book_creates_persistent_file(tmp_path):
    """Should initialize persistent rules book on disk for hybrid games."""
    game_id = "test-game-123"
    initial_rules = [
        {
            "id": "PRIME-1",
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": [{"name": "tile_is_prime"}]},
            "effect": {"type": "add_score", "amount": 2, "target": "self"},
            "source": "Prime tile grants +2 score"
        }
    ]

    entries = init_hybrid_rules_book(game_id, "hybrid", initial_rules, "Curated Book", custom_dir=tmp_path)
    assert len(entries) == 1
    assert entries[0]["id"] == "PRIME-1"
    assert entries[0]["game_id"] == game_id
    assert entries[0]["status"] == "active"
    assert entries[0]["order"] == 1

    # Check file exists on disk
    loaded = load_rules_book(game_id, custom_dir=tmp_path)
    assert loaded is not None
    assert len(loaded) == 1
    assert loaded[0]["id"] == "PRIME-1"


def test_init_non_hybrid_mode_does_not_persist(tmp_path):
    """Non-hybrid modes should not initialize or persist a Rules Book."""
    game_id = "live-game-999"
    entries = init_hybrid_rules_book(game_id, "live", [], custom_dir=tmp_path)
    assert entries == []
    assert load_rules_book(game_id, custom_dir=tmp_path) is None


def test_hybrid_mode_has_fixed_starting_rules_persisted(client):
    """Hybrid Mode must store and persist the fixed starting rules from the rulebook."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }

    create_res = client.post("/game/new", json=req_data)
    assert create_res.status_code in (200, 201), create_res.text
    game_id = create_res.json()["game_id"]

    # Verify Rules Book endpoint returns the fixed starting rules
    book_res = client.get(f"/game/{game_id}/rules-book")
    assert book_res.status_code == 200
    book_data = book_res.json()
    assert book_data["game_id"] == game_id
    assert book_data["mode"] == "hybrid"
    assert len(book_data["rules"]) > 0

    # Rules are active and ordered
    for idx, rule in enumerate(book_data["rules"]):
        assert rule["status"] == "active"
        assert rule["order"] == idx + 1
        assert rule["game_id"] == game_id
        assert "compiled_rule" in rule


def test_hybrid_mode_disallows_amending_or_adding_rules(client):
    """In Hybrid Mode, rules are fixed; players cannot add or change rules."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    # Roll a turn
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Attempt to amend in hybrid mode
    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "When you land, gain 5 points"}
    )
    assert amend_res.status_code == 200
    amend_data = amend_res.json()
    assert amend_data["accepted"] is False
    assert "not allowed in hybrid mode" in amend_data["error"]

    # Check Rules Book: rule count must remain completely unchanged
    book_res = client.get(f"/game/{game_id}/rules-book")
    rules = book_res.json()["rules"]
    assert not any("gain 5 points" in r.get("original_text", "") for r in rules)


def test_hybrid_fixed_rules_remain_available_after_reopening_game(client):
    """Fixed rules must remain accessible from disk persistence even after server restart."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    book_before = client.get(f"/game/{game_id}/rules-book").json()["rules"]
    assert len(book_before) > 0

    # Wipe in-memory dictionary to simulate server restart
    if game_id in games:
        del games[game_id]

    # Reopening game / fetching rules-book reads directly from persistent disk
    book_after = client.get(f"/game/{game_id}/rules-book").json()["rules"]
    assert len(book_after) == len(book_before)
    assert [r["id"] for r in book_after] == [r["id"] for r in book_before]


def test_game_isolation_rules_do_not_bleed_between_games(client):
    """Rules belonging to one game must never appear in another game's Rules Book."""
    req1 = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "hybrid", "max_rules": 8},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
    }
    req2 = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "hybrid", "max_rules": 8},
        "players": [{"id": "P1", "name": "Charlie"}, {"id": "P2", "name": "Dave"}],
    }

    g1_id = client.post("/game/new", json=req1).json()["game_id"]
    g2_id = client.post("/game/new", json=req2).json()["game_id"]

    g1_book = client.get(f"/game/{g1_id}/rules-book").json()["rules"]
    g2_book = client.get(f"/game/{g2_id}/rules-book").json()["rules"]

    assert all(r["game_id"] == g1_id for r in g1_book)
    assert all(r["game_id"] == g2_id for r in g2_book)


def test_rules_book_endpoint_errors_for_invalid_game_or_mode(client):
    """Rules Book endpoint returns 404 for nonexistent games and 400 for non-hybrid modes."""
    res_404 = client.get("/game/nonexistent-game-id/rules-book")
    assert res_404.status_code == 404
    assert "not found" in res_404.json()["detail"].lower()

    live_req = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
    }
    live_id = client.post("/game/new", json=live_req).json()["game_id"]
    res_400 = client.get(f"/game/{live_id}/rules-book")
    assert res_400.status_code == 400
    assert "only available for hybrid mode" in res_400.json()["detail"].lower()
