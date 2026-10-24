"""
Tests for Hybrid Mode Rules Book persistence and data integrity.

Verifies:
1. An accepted Hybrid Mode rule is saved to the Rules Book.
2. A rejected rule is not saved as active.
3. Multiple accepted rules appear in their correct order.
4. Rules remain available after reopening / reloading the game.
5. Rules belonging to one game do not appear in another game's Rules Book.
6. Retrying the same amendment request does not create duplicate entries.
7. Existing game modes (draft, live) continue to work properly.
8. Clear errors are returned for invalid game IDs or unavailable games.
"""

import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app import app, games, set_rng_factory
from backend.rules_book import (
    get_rules_book_dir,
    init_hybrid_rules_book,
    load_rules_book,
    save_rules_book,
    add_rule_to_book,
)


@pytest.fixture
def client():
    """Create a FastAPI test client."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_rules_book_storage():
    """Clean up rules_books storage before and after tests."""
    storage_dir = get_rules_book_dir()
    # Clean files before
    for f in storage_dir.glob("*.json"):
        try:
            f.unlink()
        except OSError:
            pass
    yield
    # Clean files after
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


def test_accepted_hybrid_rule_saved_to_rules_book(client):
    """Accepted Hybrid Mode rule must be saved to the persistent Rules Book."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }

    create_res = client.post("/game/new", json=req_data)
    assert create_res.status_code in (200, 201), create_res.text
    game_id = create_res.json()["game_id"]

    # Roll turn for P1
    roll_res = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll_res.status_code == 200

    # Submit valid amendment
    amend_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "When you land, gain 2 points"}
    )
    assert amend_res.status_code == 200
    amend_data = amend_res.json()
    assert amend_data["accepted"] is True
    added_rule_id = amend_data["rule"]["id"]

    # Verify Rules Book endpoint returns the newly accepted rule
    book_res = client.get(f"/game/{game_id}/rules-book")
    assert book_res.status_code == 200
    book_data = book_res.json()
    assert book_data["game_id"] == game_id
    assert book_data["mode"] == "hybrid"

    active_rule_ids = [r["id"] for r in book_data["rules"] if r["status"] == "active"]
    assert added_rule_id in active_rule_ids

    # Find the specific rule entry
    entry = next(r for r in book_data["rules"] if r["id"] == added_rule_id)
    assert entry["proposer_id"] == "P1"
    assert entry["proposer_name"] == "Alice"
    assert "gain 2 points" in entry["original_text"]
    assert entry["status"] == "active"


def test_rejected_rule_is_not_saved_as_active(client):
    """A rejected rule must not be saved as active in the Rules Book."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    # Initial rule count
    initial_book_res = client.get(f"/game/{game_id}/rules-book")
    initial_active_count = len([r for r in initial_book_res.json()["rules"] if r["status"] == "active"])

    # Roll turn
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Submit invalid input (not a game rule)
    reject_res = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": "P1", "text": "Hello what is your name?"}
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["accepted"] is False

    # Check Rules Book: active count must not increase
    book_res = client.get(f"/game/{game_id}/rules-book")
    current_active_count = len([r for r in book_res.json()["rules"] if r["status"] == "active"])
    assert current_active_count == initial_active_count


def test_multiple_accepted_rules_appear_in_correct_order(client):
    """Multiple accepted rules must appear in the exact order they were accepted."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 50,
            "mode": "hybrid",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    # Turn 1: P1 rolls and amends
    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    r1 = client.post(f"/game/{game_id}/amend", json={"player_id": "P1", "text": "When you land, gain 1 point"}).json()
    assert r1["accepted"] is True
    r1_id = r1["rule"]["id"]

    # Turn 2: P2 rolls and amends
    client.post(f"/game/{game_id}/roll", json={"player_id": "P2"})
    r2 = client.post(f"/game/{game_id}/amend", json={"player_id": "P2", "text": "When you roll an even number, gain 2 points"}).json()
    assert r2["accepted"] is True
    r2_id = r2["rule"]["id"]

    # Fetch Rules Book
    book_res = client.get(f"/game/{game_id}/rules-book")
    rules = book_res.json()["rules"]

    # Check order
    rule_ids = [r["id"] for r in rules]
    assert r1_id in rule_ids
    assert r2_id in rule_ids
    assert rule_ids.index(r1_id) < rule_ids.index(r2_id)


def test_rules_remain_available_after_reopening_game(client):
    """Rules must remain accessible from disk persistence even if in-memory cache is wiped."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    amend_res = client.post(f"/game/{game_id}/amend", json={"player_id": "P1", "text": "When you land, gain 3 points"})
    assert amend_res.json()["accepted"] is True
    added_id = amend_res.json()["rule"]["id"]

    # Simulate server memory wipe (server restart / new process)
    if game_id in games:
        del games[game_id]

    # Reopening game / fetching rules-book should read from persistent disk storage!
    book_res = client.get(f"/game/{game_id}/rules-book")
    assert book_res.status_code == 200
    rules = book_res.json()["rules"]
    assert any(r["id"] == added_id for r in rules)


def test_game_isolation_rules_do_not_bleed_between_games(client):
    """Rules belonging to one game must never appear in another game's Rules Book."""
    req1 = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "hybrid", "max_rules": 8, "amend_every": 1},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
    }
    req2 = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "hybrid", "max_rules": 8, "amend_every": 1},
        "players": [{"id": "P1", "name": "Charlie"}, {"id": "P2", "name": "Dave"}],
    }

    g1_id = client.post("/game/new", json=req1).json()["game_id"]
    g2_id = client.post("/game/new", json=req2).json()["game_id"]

    # Game 1 adds custom rule
    client.post(f"/game/{g1_id}/roll", json={"player_id": "P1"})
    r1 = client.post(f"/game/{g1_id}/amend", json={"player_id": "P1", "text": "When you land, gain 3 points"}).json()
    assert r1["accepted"] is True
    r1_id = r1["rule"]["id"]

    # Game 2 Rules Book must NOT contain Game 1's custom rule
    g2_book = client.get(f"/game/{g2_id}/rules-book").json()["rules"]
    assert not any(r["id"] == r1_id and r["proposer_name"] == "Alice" for r in g2_book)


def test_retrying_same_amendment_request_does_not_create_duplicates(client):
    """Retrying the exact same amendment request should be idempotent and not create duplicate entries."""
    req_data = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 25,
            "mode": "hybrid",
            "max_rules": 8,
            "amend_every": 1,
        },
        "players": [
            {"id": "P1", "name": "Alice"},
            {"id": "P2", "name": "Bob"},
        ],
    }
    create_res = client.post("/game/new", json=req_data)
    game_id = create_res.json()["game_id"]

    client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})

    # Send amendment
    amend1 = client.post(f"/game/{game_id}/amend", json={"player_id": "P1", "text": "When you land, gain 2 points"})
    assert amend1.json()["accepted"] is True

    # Immediate retry of identical amendment request
    amend2 = client.post(f"/game/{game_id}/amend", json={"player_id": "P1", "text": "When you land, gain 2 points"})
    assert amend2.json()["accepted"] is True

    # Verify no duplicates in Rules Book
    book_res = client.get(f"/game/{game_id}/rules-book")
    rules = book_res.json()["rules"]
    matching_entries = [r for r in rules if r.get("original_text") == "When you land, gain 2 points"]
    assert len(matching_entries) == 1


def test_rules_book_endpoint_errors_for_invalid_game_or_mode(client):
    """Rules Book endpoint returns 404 for nonexistent games and 400 for non-hybrid modes."""
    # 404 for invalid game
    res_404 = client.get("/game/nonexistent-game-id/rules-book")
    assert res_404.status_code == 404
    assert "not found" in res_404.json()["detail"].lower()

    # 400 for live mode game
    live_req = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 25, "mode": "live", "max_rules": 8, "amend_every": 1},
        "players": [{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
    }
    live_id = client.post("/game/new", json=live_req).json()["game_id"]
    res_400 = client.get(f"/game/{live_id}/rules-book")
    assert res_400.status_code == 400
    assert "only available for hybrid mode" in res_400.json()["detail"].lower()
