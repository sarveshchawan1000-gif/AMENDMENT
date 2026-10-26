"""Predefined amendment library loader and repository."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Dict, Any, List


_LIBRARY_CACHE: Optional[List[Dict[str, Any]]] = None


def get_default_library_path() -> Path:
    """Return default path to backend/data/amendment_library.json."""
    return Path(__file__).resolve().parent.parent / "data" / "amendment_library.json"


def load_amendment_library(path: Optional[Path] = None, force_reload: bool = False) -> List[Dict[str, Any]]:
    """Load predefined amendments from disk with in-memory caching."""
    global _LIBRARY_CACHE
    if _LIBRARY_CACHE is not None and not force_reload and path is None:
        return _LIBRARY_CACHE

    target_path = path or get_default_library_path()
    if not target_path.exists():
        return []

    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError(f"Expected list in {target_path}, got {type(data).__name__}")

    if path is None:
        _LIBRARY_CACHE = data

    return data


def get_all_amendments() -> List[Dict[str, Any]]:
    """Return all catalog amendments."""
    return load_amendment_library()


def get_amendment_by_id(amendment_id: str) -> Optional[Dict[str, Any]]:
    """Resolve a predefined amendment by its stable ID."""
    for entry in get_all_amendments():
        if entry.get("id") == amendment_id:
            return entry
    return None


def get_valid_amendments() -> List[Dict[str, Any]]:
    """Return all amendments flagged as valid in metadata."""
    return [
        entry for entry in get_all_amendments()
        if entry.get("validation_metadata", {}).get("is_valid", False) is True
    ]
