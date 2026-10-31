"""
Persistent amendment rule cache using SQLite.

Caches successfully compiled and validated amendments to eliminate redundant
LLM calls, reduce latency, and provide offline determinism for repeated proposals.
"""

from __future__ import annotations

import os
import re
import json
import time
import sqlite3
import hashlib
import threading
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

DEFAULT_COMPILER_VERSION = "1.0"


def normalize_proposal_text(text: str) -> str:
    """
    Safely normalize amendment proposal text for deterministic caching:
    - Strips leading and trailing whitespace and surrounding quotes
    - Collapses internal whitespace to single spaces
    - Lowercases text for case-insensitive matching
    - Removes punctuation marks like ',', '.', ';', '!', '?' attached to words
    """
    if not text or not isinstance(text, str):
        return ""
    cleaned = re.sub(r"\s+", " ", text).strip().lower()
    cleaned = cleaned.strip("\"'“”`")
    cleaned = re.sub(r"[,\.;:!?]+(?=\s|$)", "", cleaned)
    cleaned = re.sub(r"[\.,;:!?]+$", "", cleaned).strip()
    return cleaned


def compute_cache_key(
    text: str,
    state: dict,
    compiler_version: str = DEFAULT_COMPILER_VERSION,
) -> Tuple[str, str, Dict[str, Any]]:
    """
    Compute a deterministic SHA-256 cache key including:
    - compiler/schema version
    - normalized proposal text
    - game compilation context (board_size, dice_type, win_target)

    Returns:
        (cache_key, normalized_text, context_dict)
    """
    normalized = normalize_proposal_text(text)
    settings = state.get("settings", {})
    context = {
        "board_size": int(settings.get("board_size", 6)),
        "dice_type": str(settings.get("dice_type", "1d6")),
        "win_target": int(settings.get("win_target", 21)),
    }
    payload = {
        "v": compiler_version,
        "text": normalized,
        "context": context,
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    key = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return key, normalized, context


class RuleCache:
    """
    Thread-safe persistent SQLite storage for compiled and validated rules.
    """

    def __init__(self, db_path: Optional[str | Path] = None):
        if db_path is None:
            configured_path = os.getenv("RULE_CACHE_DB_PATH", "").strip()
            if configured_path:
                self.db_path = Path(configured_path)
            else:
                self.db_path = Path(__file__).resolve().parent.parent / "data" / "rule_cache.db"
        else:
            self.db_path = Path(db_path)

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS amendment_cache (
                    cache_key TEXT PRIMARY KEY,
                    normalized_text TEXT NOT NULL,
                    compiler_version TEXT NOT NULL,
                    context_json TEXT NOT NULL,
                    rule_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    hit_count INTEGER DEFAULT 0,
                    last_hit_at REAL
                );
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_normalized_text ON amendment_cache(normalized_text);"
            )
            conn.commit()

    def get(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a cached rule by key.
        Increments hit_count and updates last_hit_at.
        Returns None if not found or corrupted.
        """
        with self._lock, self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT rule_json, hit_count FROM amendment_cache WHERE cache_key = ?",
                (cache_key,),
            )
            row = cursor.fetchone()
            if not row:
                return None

            try:
                rule = json.loads(row["rule_json"])
                # Update metrics
                conn.execute(
                    "UPDATE amendment_cache SET hit_count = hit_count + 1, last_hit_at = ? WHERE cache_key = ?",
                    (time.time(), cache_key),
                )
                conn.commit()
                return rule
            except Exception:
                # Corrupted record, invalidate safely
                conn.execute("DELETE FROM amendment_cache WHERE cache_key = ?", (cache_key,))
                conn.commit()
                return None

    def set(
        self,
        cache_key: str,
        normalized_text: str,
        context: Dict[str, Any],
        rule: Dict[str, Any],
        compiler_version: str = DEFAULT_COMPILER_VERSION,
    ) -> None:
        """
        Persist a validated rule into SQLite.
        """
        rule_json = json.dumps(rule, sort_keys=True)
        context_json = json.dumps(context, sort_keys=True)
        now = time.time()

        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO amendment_cache (
                    cache_key, normalized_text, compiler_version, context_json, rule_json, created_at, hit_count, last_hit_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
                """,
                (cache_key, normalized_text, compiler_version, context_json, rule_json, now),
            )
            conn.commit()

    def invalidate(self, cache_key: str) -> None:
        """Invalidate a specific cache key."""
        with self._lock, self._get_connection() as conn:
            conn.execute("DELETE FROM amendment_cache WHERE cache_key = ?", (cache_key,))
            conn.commit()

    def clear(self) -> None:
        """Clear all entries in the cache (primarily for tests)."""
        with self._lock, self._get_connection() as conn:
            conn.execute("DELETE FROM amendment_cache")
            conn.commit()

    def count(self) -> int:
        """Return total number of cached amendment rules."""
        with self._lock, self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM amendment_cache")
            return cursor.fetchone()[0]


# Shared default singleton
rule_cache = RuleCache()
