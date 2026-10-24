"""
Rules Book persistence module for AMENDMENT Hybrid Mode.

Stores and retrieves Court-validated and compiled rules associated with
Hybrid Mode games across page refreshes and server reloads.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def get_project_root() -> Path:
    """Get the project root directory (parent of backend/)."""
    return Path(__file__).parent.parent


def get_rules_book_dir(custom_dir: Optional[Path] = None) -> Path:
    """Return the directory where Hybrid Rules Books are stored."""
    if custom_dir is not None:
        path = custom_dir
    else:
        path = get_project_root() / "data" / "rules_books"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_book_file(game_id: str, custom_dir: Optional[Path] = None) -> Path:
    """Return file path for a specific game's Rules Book."""
    storage_dir = get_rules_book_dir(custom_dir)
    # Sanitize game_id to avoid path traversal
    safe_name = "".join(c for c in game_id if c.isalnum() or c in ("-", "_"))
    return storage_dir / f"{safe_name}.json"


def save_rules_book(game_id: str, rules: List[Dict[str, Any]], custom_dir: Optional[Path] = None) -> None:
    """
    Atomically save a Hybrid Mode game's Rules Book to persistent storage.
    
    Uses tempfile + atomic rename so a failed write does not corrupt existing data.
    """
    target_file = _get_book_file(game_id, custom_dir)
    target_dir = target_file.parent
    target_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "game_id": game_id,
        "mode": "hybrid",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "total_rules": len(rules),
        "rules": rules,
    }

    # Atomic write pattern
    temp_fd, temp_path = tempfile.mkstemp(dir=target_dir, prefix=f"{target_file.stem}_", suffix=".tmp")
    try:
        with open(temp_fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        os.replace(temp_path, target_file)
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise IOError(f"Failed to persist Rules Book for game {game_id}: {e}") from e


def load_rules_book(game_id: str, custom_dir: Optional[Path] = None) -> Optional[List[Dict[str, Any]]]:
    """
    Load a Hybrid Mode game's Rules Book from persistent storage.
    
    Returns None if no Rules Book exists for the given game ID.
    """
    target_file = _get_book_file(game_id, custom_dir)
    if not target_file.exists():
        return None

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict) and "rules" in data:
                return data["rules"]
            elif isinstance(data, list):
                return data
            return []
    except Exception as e:
        print(f"Warning: Failed to load Rules Book from {target_file}: {e}", file=sys.stderr)
        return None


def init_hybrid_rules_book(
    game_id: str,
    mode: str,
    initial_rules: List[Dict[str, Any]],
    rulebook_name: str = "Curated Rulebook",
    custom_dir: Optional[Path] = None
) -> List[Dict[str, Any]]:
    """
    Initialize persistent Rules Book for a new Hybrid Mode game.
    Does nothing if mode != 'hybrid'.
    """
    if mode != "hybrid":
        return []

    existing = load_rules_book(game_id, custom_dir)
    if existing is not None:
        return existing

    entries: List[Dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for i, rule in enumerate(initial_rules):
        rule_id = str(rule.get("id", f"R-{i + 1}"))
        source_text = rule.get("source", rule.get("title", f"Rule {rule_id}"))
        entry = {
            "id": rule_id,
            "game_id": game_id,
            "original_text": source_text,
            "description": source_text,
            "compiled_rule": rule,
            "proposer_id": "rulebook",
            "proposer_name": rulebook_name,
            "created_at": now_iso,
            "status": "active",
            "order": i + 1,
        }
        entries.append(entry)

    save_rules_book(game_id, entries, custom_dir)
    return entries


def add_rule_to_book(
    game_id: str,
    rule: Dict[str, Any],
    original_text: str,
    proposer_id: str,
    proposer_name: str,
    status: str = "active",
    custom_dir: Optional[Path] = None
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """
    Add an accepted rule to the game's persistent Rules Book.
    
    Guarantees:
    - Retrying the same amendment request does not create duplicates.
    - Preserves order of accepted rules.
    - Raises/returns error if disk persistence fails (for caller rollback).
    """
    current_rules = load_rules_book(game_id, custom_dir) or []

    rule_id = str(rule.get("id", f"A{len(current_rules) + 1}"))

    # Idempotency check: don't create duplicate entries for retries
    for existing in current_rules:
        if existing["id"] == rule_id:
            return True, existing, None
        if (
            existing.get("proposer_id") == proposer_id
            and existing.get("original_text", "").strip().lower() == original_text.strip().lower()
            and existing.get("status") == status
        ):
            return True, existing, None

    description = rule.get("source") or original_text
    new_entry = {
        "id": rule_id,
        "game_id": game_id,
        "original_text": original_text,
        "description": description,
        "compiled_rule": rule,
        "proposer_id": proposer_id,
        "proposer_name": proposer_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "order": len(current_rules) + 1,
    }

    current_rules.append(new_entry)

    try:
        save_rules_book(game_id, current_rules, custom_dir)
    except Exception as e:
        return False, {}, str(e)

    return True, new_entry, None
