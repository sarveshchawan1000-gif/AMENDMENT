"""
Tests for the improved rulebook loader.

Tests schema validation, rule validation, and error handling.
"""

import json
import pytest
import tempfile
from pathlib import Path
from backend.app import load_rulebooks, get_project_root


@pytest.fixture
def temp_rulebooks_dir():
    """Create a temporary directory for test rulebooks."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def valid_rulebook():
    """A valid rulebook for testing."""
    return {
        "name": "Test Rulebook",
        "board_sizes": [6, 8],
        "rules": [
            {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 2, "target": "self"},
                "source": "Test rule"
            }
        ]
    }


# --- Path resolution tests ---

def test_get_project_root():
    """Should resolve project root correctly."""
    root = get_project_root()
    assert root.exists()
    assert (root / "backend").exists()
    assert (root / "schema").exists()


def test_load_rulebooks_works_from_any_cwd(temp_rulebooks_dir, valid_rulebook, monkeypatch):
    """Should work regardless of current working directory."""
    import os
    
    # Write valid rulebook
    rulebook_file = temp_rulebooks_dir / "test.json"
    with open(rulebook_file, "w") as f:
        json.dump(valid_rulebook, f)
    
    # Change to a different directory
    original_cwd = Path.cwd()
    try:
        monkeypatch.chdir("/tmp")
        assert Path.cwd() != original_cwd
        
        # Should still load successfully with explicit path
        rulebooks = load_rulebooks(temp_rulebooks_dir)
        assert len(rulebooks) == 1
        assert rulebooks[0]["name"] == "Test Rulebook"
    finally:
        monkeypatch.chdir(original_cwd)


# --- Valid rulebook tests ---

def test_load_valid_rulebook(temp_rulebooks_dir, valid_rulebook):
    """Should load a valid rulebook."""
    rulebook_file = temp_rulebooks_dir / "valid.json"
    with open(rulebook_file, "w") as f:
        json.dump(valid_rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 1
    assert rulebooks[0]["name"] == "Test Rulebook"
    assert len(rulebooks[0]["rules"]) == 1


def test_load_multiple_valid_rulebooks(temp_rulebooks_dir, valid_rulebook):
    """Should load multiple valid rulebooks."""
    for i in range(3):
        rulebook = valid_rulebook.copy()
        rulebook["name"] = f"Rulebook {i}"
        rulebook_file = temp_rulebooks_dir / f"rulebook_{i}.json"
        with open(rulebook_file, "w") as f:
            json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 3
    names = [r["name"] for r in rulebooks]
    assert "Rulebook 0" in names
    assert "Rulebook 1" in names
    assert "Rulebook 2" in names


def test_load_rulebook_without_board_sizes(temp_rulebooks_dir):
    """Should load rulebook without board_sizes (means all sizes)."""
    rulebook = {
        "name": "Universal Rulebook",
        "rules": [
            {
                "trigger": "on_roll",
                "condition": {"mode": "all", "predicates": [{"name": "roll_is_even"}]},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "universal.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 1
    assert "board_sizes" not in rulebooks[0] or rulebooks[0].get("board_sizes") == []


# --- Malformed JSON tests ---

def test_skip_malformed_json(temp_rulebooks_dir, valid_rulebook, capsys):
    """Should skip files with malformed JSON."""
    # Write invalid JSON
    invalid_file = temp_rulebooks_dir / "invalid.json"
    with open(invalid_file, "w") as f:
        f.write('{"name": "test", invalid}')
    
    # Write valid rulebook
    valid_file = temp_rulebooks_dir / "valid.json"
    with open(valid_file, "w") as f:
        json.dump(valid_rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    
    # Should load only the valid one
    assert len(rulebooks) == 1
    assert rulebooks[0]["name"] == "Test Rulebook"
    
    # Should log error
    captured = capsys.readouterr()
    assert "invalid.json" in captured.err
    assert "Malformed JSON" in captured.err


def test_skip_non_object_json(temp_rulebooks_dir, capsys):
    """Should skip JSON that isn't an object."""
    # Write array instead of object
    invalid_file = temp_rulebooks_dir / "array.json"
    with open(invalid_file, "w") as f:
        json.dump(["not", "an", "object"], f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "array.json" in captured.err
    assert "not a JSON object" in captured.err


# --- Missing required fields tests ---

def test_skip_missing_name(temp_rulebooks_dir, capsys):
    """Should skip rulebook without name field."""
    rulebook = {
        "rules": [
            {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "no_name.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "no_name.json" in captured.err
    assert "'name'" in captured.err and "required" in captured.err.lower()


def test_skip_missing_rules(temp_rulebooks_dir, capsys):
    """Should skip rulebook without rules field."""
    rulebook = {"name": "No Rules"}
    
    rulebook_file = temp_rulebooks_dir / "no_rules.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "no_rules.json" in captured.err
    assert "'rules'" in captured.err and "required" in captured.err.lower()


# --- Invalid rule tests ---

def test_skip_invalid_trigger(temp_rulebooks_dir, capsys):
    """Should skip rulebook with invalid trigger."""
    rulebook = {
        "name": "Invalid Trigger",
        "rules": [
            {
                "trigger": "on_death",  # Invalid trigger
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "bad_trigger.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "bad_trigger.json" in captured.err
    assert "on_death" in captured.err


def test_skip_invalid_effect_amount(temp_rulebooks_dir, capsys):
    """Should skip rulebook with effect amount exceeding cap."""
    rulebook = {
        "name": "Excessive Amount",
        "rules": [
            {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 10, "target": "self"}  # Exceeds cap of 5
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "big_amount.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "big_amount.json" in captured.err
    assert "10" in captured.err and ("maximum" in captured.err.lower() or "greater" in captured.err.lower())


def test_skip_missing_score_gt_args(temp_rulebooks_dir, capsys):
    """Should skip rulebook where score_gt predicate lacks args.value."""
    rulebook = {
        "name": "Missing Args",
        "rules": [
            {
                "trigger": "on_land",
                "condition": {
                    "mode": "all",
                    "predicates": [{"name": "score_gt"}]  # Missing args
                },
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "missing_args.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "missing_args.json" in captured.err
    assert "'args'" in captured.err and "required" in captured.err.lower()


# --- Invalid board sizes tests ---

def test_skip_invalid_board_size(temp_rulebooks_dir, capsys):
    """Should skip rulebook with invalid board size."""
    rulebook = {
        "name": "Bad Board Size",
        "board_sizes": [7],  # Invalid - must be 6, 8, or 10
        "rules": [
            {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "bad_size.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "bad_size.json" in captured.err
    # Schema validation should catch this
    assert "Schema validation failed" in captured.err or "Invalid board size" in captured.err


def test_skip_non_array_board_sizes(temp_rulebooks_dir, capsys):
    """Should skip rulebook where board_sizes is not an array."""
    rulebook = {
        "name": "Non-Array Sizes",
        "board_sizes": 6,  # Should be array
        "rules": [
            {
                "trigger": "on_land",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"}
            }
        ]
    }
    
    rulebook_file = temp_rulebooks_dir / "bad_sizes_type.json"
    with open(rulebook_file, "w") as f:
        json.dump(rulebook, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert len(rulebooks) == 0
    
    captured = capsys.readouterr()
    assert "bad_sizes_type.json" in captured.err


# --- Mixed valid/invalid tests ---

def test_load_valid_skip_invalid(temp_rulebooks_dir, valid_rulebook, capsys):
    """Should load valid rulebooks and skip invalid ones."""
    # Write 2 valid
    for i in range(2):
        rb = valid_rulebook.copy()
        rb["name"] = f"Valid {i}"
        with open(temp_rulebooks_dir / f"valid_{i}.json", "w") as f:
            json.dump(rb, f)
    
    # Write 2 invalid
    with open(temp_rulebooks_dir / "malformed.json", "w") as f:
        f.write("{invalid json")
    
    with open(temp_rulebooks_dir / "no_name.json", "w") as f:
        json.dump({"rules": []}, f)
    
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    
    # Should load only the 2 valid ones
    assert len(rulebooks) == 2
    names = [r["name"] for r in rulebooks]
    assert "Valid 0" in names
    assert "Valid 1" in names
    
    # Should log errors for invalid ones
    captured = capsys.readouterr()
    assert "malformed.json" in captured.err
    assert "no_name.json" in captured.err


# --- Empty directory test ---

def test_empty_directory(temp_rulebooks_dir):
    """Should return empty list for empty directory."""
    rulebooks = load_rulebooks(temp_rulebooks_dir)
    assert rulebooks == []


def test_nonexistent_directory():
    """Should return empty list for nonexistent directory."""
    rulebooks = load_rulebooks(Path("/nonexistent/path"))
    assert rulebooks == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
