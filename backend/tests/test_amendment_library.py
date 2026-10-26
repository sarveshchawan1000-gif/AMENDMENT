"""
Unit tests for the backend-owned amendment library module and catalog.
"""

import re
import pytest
from backend.engine.amendment_library import (
    load_amendment_library,
    get_all_amendments,
    get_valid_amendments,
    get_amendment_by_id,
)
from backend.engine.validate import validate_rule


def test_library_loads_and_has_all_entries():
    """Verify that the amendment library loads all 100 playable + 4 invalid test entries."""
    library = load_amendment_library(force_reload=True)
    assert isinstance(library, list)
    assert len(library) == 104, f"Expected 104 total entries, got {len(library)}"

    # Check ID uniqueness
    ids = [item["id"] for item in library]
    assert len(ids) == len(set(ids)), "Duplicate IDs found in library!"

    # Check format of IDs
    for item_id in ids:
        assert re.match(r"^AMEND_\d{3}$", item_id), f"Malformed ID: {item_id}"


def test_stable_ids_001_to_008_preserved():
    """Verify original stable IDs AMEND_001..AMEND_008 are preserved."""
    expected_titles = {
        "AMEND_001": "Prime Sanctuary",
        "AMEND_002": "Even Momentum",
        "AMEND_003": "Underdog Relief",
        "AMEND_004": "Robin Hood Accord",
        "AMEND_005": "Leader Surcharge",
        "AMEND_006": "Second Roll Opportunity",
        "AMEND_007": "Sudden Death Accord",
        "AMEND_008": "High Scorer Bonus",
    }
    for amend_id, title in expected_titles.items():
        entry = get_amendment_by_id(amend_id)
        assert entry is not None, f"Missing {amend_id}"
        assert entry["title"] == title, f"Title mismatch for {amend_id}"


def test_valid_entries_count_and_distribution():
    """Verify exactly 100 valid playable amendments with diverse category distribution."""
    valid_items = get_valid_amendments()
    assert len(valid_items) == 100, f"Expected exactly 100 valid rules, got {len(valid_items)}"

    # Category counts
    cat_counts = {}
    for item in valid_items:
        cat = item.get("category")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    expected_categories = {"scoring", "movement", "catch_up", "disruption", "endgame"}
    assert set(cat_counts.keys()) == expected_categories

    # Every category must have a healthy representation (at least 15 rules each)
    for cat in expected_categories:
        assert cat_counts[cat] >= 15, f"Category {cat} has only {cat_counts[cat]} rules"

    assert cat_counts["scoring"] == 22
    assert cat_counts["movement"] == 20
    assert cat_counts["catch_up"] == 20
    assert cat_counts["disruption"] == 20
    assert cat_counts["endgame"] == 18


def test_functional_signature_uniqueness():
    """Verify no duplicate or functionally identical rules exist in the 100 valid rules."""
    valid_items = get_valid_amendments()
    signatures = {}

    for item in valid_items:
        payload = item["rule_payload"]
        trigger = payload["trigger"]
        etype = payload["effect"]["type"]
        etarget = payload["effect"]["target"]
        eamt = payload["effect"]["amount"]
        preds = tuple(sorted(
            (p["name"], tuple(sorted(p.get("args", {}).items())))
            for p in payload["condition"]["predicates"]
        ))
        cmode = payload["condition"]["mode"]
        sig = (trigger, cmode, preds, etype, etarget, eamt)

        assert sig not in signatures, (
            f"Duplicate functional signature found between {item['id']} and {signatures[sig]}: {sig}"
        )
        signatures[sig] = item["id"]

    assert len(signatures) == 100


def test_every_valid_entry_conforms_to_engine_validator():
    """Verify that every single one of the 100 valid amendments passes engine validate_rule."""
    valid_items = get_valid_amendments()

    for item in valid_items:
        assert item["validation_metadata"]["is_valid"] is True
        payload = item["rule_payload"]
        is_valid, error = validate_rule(payload)
        assert is_valid is True, f"Amendment {item['id']} failed engine validate_rule: {error}"


def test_all_invalid_entries_fail_engine_validation():
    """Verify invalid test entries are kept separate and fail engine validate_rule."""
    all_items = get_all_amendments()
    invalid_items = [i for i in all_items if i.get("validation_metadata", {}).get("is_valid") is False]
    assert len(invalid_items) >= 4

    invalid_ids = [i["id"] for i in invalid_items]
    assert "AMEND_901" in invalid_ids
    assert "AMEND_902" in invalid_ids
    assert "AMEND_903" in invalid_ids
    assert "AMEND_904" in invalid_ids

    for item in invalid_items:
        payload = item["rule_payload"]
        is_valid, error = validate_rule(payload)
        assert is_valid is False, f"Invalid test rule {item['id']} unexpectedly passed validate_rule!"
        assert error is not None


def test_description_payload_consistency():
    """Verify description accurately represents trigger, condition, amount, and target."""
    valid_items = get_valid_amendments()

    for item in valid_items:
        desc = item["description"].lower()
        payload = item["rule_payload"]
        effect = payload["effect"]
        etype = effect["type"]
        amount = effect["amount"]

        # Check set_win_target amount in description
        if etype == "set_win_target":
            assert str(amount) in desc, f"{item['id']}: win target {amount} not in description {desc}"

        # Check skip_turn in description
        if etype == "skip_turn":
            assert "skip" in desc, f"{item['id']}: 'skip' not in description {desc}"

        # Check reroll in description
        if etype == "reroll":
            assert "reroll" in desc, f"{item['id']}: 'reroll' not in description {desc}"

        # Check steal in description
        if etype == "steal_score":
            assert "steal" in desc or "transfer" in desc, f"{item['id']}: 'steal'/'transfer' not in {desc}"

        # Check predicates
        pred_names = [p["name"] for p in payload["condition"]["predicates"]]
        if "tile_is_prime" in pred_names:
            assert "prime" in desc, f"{item['id']}: 'prime' not in description {desc}"
        if "roll_is_even" in pred_names:
            assert "even" in desc, f"{item['id']}: 'even' not in description {desc}"
        if "is_leader" in pred_names:
            assert "leader" in desc, f"{item['id']}: 'leader' not in description {desc}"
        if "is_last" in pred_names:
            assert "last" in desc or "trailing" in desc or "underdog" in desc, f"{item['id']}: last not in {desc}"
