"""Deterministic, state-aware suggestion selection engine for rule amendments."""
from __future__ import annotations

import copy
import hashlib
import random
from typing import Dict, Any, List

from backend.engine.amendment_library import get_all_amendments
from backend.engine.validate import validate_rule
from backend.engine.state import rank_players
from backend.engine.engine import _resolve_steal_target, get_rule_conflict_key


def _is_rule_active(rule_payload: Dict[str, Any], active_rules: List[Dict[str, Any]]) -> bool:
    """Check if an equivalent rule is already active in the game."""
    target_id = rule_payload.get("id") or rule_payload.get("amendment_id")
    target_source = (rule_payload.get("source") or "").strip().lower()
    target_key = get_rule_conflict_key(rule_payload)
    target_amount = rule_payload.get("effect", {}).get("amount")

    for r in active_rules:
        # Check matching ID
        if target_id and (r.get("id") == target_id or r.get("amendment_id") == target_id):
            return True

        # Check matching source text
        active_source = (r.get("source") or "").strip().lower()
        if target_source and active_source and target_source == active_source:
            return True

        # Check identical conflict signature (same trigger, effect type, target, and condition)
        # and identical effect amount
        if get_rule_conflict_key(r) == target_key:
            active_amount = r.get("effect", {}).get("amount")
            if active_amount == target_amount:
                return True

    return False


def _is_usable_in_state(rule_payload: Dict[str, Any], state: Dict[str, Any], player_id: str) -> bool:
    """Check if a rule is compatible and practically usable in the current game state."""
    settings = state.get("settings", {})
    players = state.get("players", [])

    # Board size limit check if rule specifies min_board_size
    min_board = rule_payload.get("min_board_size")
    if min_board and settings.get("board_size", 6) < min_board:
        return False

    effect = rule_payload.get("effect", {})
    etype = effect.get("type")

    # If win target effect, check if already at that target
    if etype == "set_win_target":
        target_val = effect.get("amount")
        if settings.get("win_target") == target_val:
            return False

    # If steal_score, verify there is at least one valid opponent target
    if etype == "steal_score":
        if len(players) < 2:
            return False
        acting_idx = next((i for i, p in enumerate(players) if p["id"] == player_id), -1)
        if acting_idx != -1:
            ranks = rank_players(players)
            target = effect.get("target", "leader")
            target_idx = _resolve_steal_target(target, acting_idx, players, ranks)
            if target_idx is None:
                return False

    return True


def get_player_suggestions(
    state: Dict[str, Any],
    player_id: str,
    count: int = 5,
) -> List[Dict[str, str]]:
    """
    Return 4–5 deterministic, state-filtered amendment suggestions for a player.

    - Excludes invalid / unvalidated rules.
    - Excludes rules already active or incompatible with current settings.
    - Prevents repeating recently suggested rules where pool allows.
    - Seeded deterministically using game_id, turn, and player_id (reopening in
      the same turn returns the exact same suggestions).
    - Returns only client-safe metadata: id, title, description, category.
    """
    players = state.get("players", [])
    player_ids = [p["id"] for p in players]
    if player_id not in player_ids:
        raise ValueError(f"Player {player_id!r} not found in game state")

    active_rules = state.get("rules", [])
    turn = int(state.get("turn", 0))
    turn_cache = state.setdefault("_turn_suggestions", {})
    cache_key = f"{turn}:{len(active_rules)}:{player_id}"
    if cache_key in turn_cache:
        # Reopening during the same turn/state: return identical suggestions if still valid and sufficient
        cached = turn_cache[cache_key]
        cached_valid = [
            s for s in cached
            if not _is_rule_active(s.get("rule_payload", {}), active_rules)
            and _is_usable_in_state(s.get("rule_payload", {}), state, player_id)
        ]
        if len(cached_valid) >= count:
            return [
                {
                    "id": s["id"],
                    "title": s["title"],
                    "description": s["description"],
                    "category": s.get("category", "general"),
                }
                for s in cached_valid[:count]
            ]

    # Step 1: Filter eligible candidates
    catalog = get_all_amendments()
    eligible: List[Dict[str, Any]] = []
    for entry in catalog:
        entry_id = str(entry.get("id", ""))
        # Explicitly exclude test fixtures AMEND_901–AMEND_904
        if entry_id.startswith("AMEND_9") or not entry_id.startswith("AMEND_"):
            continue

        # Check validation metadata
        vmeta = entry.get("validation_metadata", {})
        if vmeta.get("is_valid") is not True:
            continue

        payload = entry.get("rule_payload")
        if not payload:
            continue

        # Check engine validation
        valid, _ = validate_rule(payload)
        if not valid:
            continue

        # Check if already active
        cand_payload = copy.deepcopy(payload)
        cand_payload["id"] = entry_id
        if _is_rule_active(cand_payload, active_rules):
            continue

        # Check state usability
        if not _is_usable_in_state(payload, state, player_id):
            continue

        eligible.append(entry)

    if not eligible:
        return []

    # Step 2: Prevent recently repeated suggestions per player
    history_dict = state.setdefault("suggestion_history", {})
    player_history: List[str] = history_dict.setdefault(player_id, [])

    # Partition into not-recently-suggested and recently-suggested
    fresh = [e for e in eligible if e["id"] not in player_history]
    if len(fresh) >= count:
        candidates = fresh
    else:
        # If pool of fresh items is insufficient, backfill from eligible
        candidates = fresh + [e for e in eligible if e["id"] in player_history]

    # Step 3: Deterministic selection seeded by game_id + turn + player_id
    game_id = str(state.get("game_id", "default_game"))
    seed_str = f"{game_id}:{turn}:{player_id}"
    seed_int = int(hashlib.sha256(seed_str.encode("utf-8")).hexdigest(), 16)
    rng = random.Random(seed_int)

    # Shuffle deterministically and slice top count
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    selected = shuffled[:count]

    # Cache for repeated queries within the same turn
    turn_cache[cache_key] = selected

    # Update player suggestion history (rolling window of 25)
    for s in selected:
        if s["id"] not in player_history:
            player_history.append(s["id"])
    if len(player_history) > 25:
        history_dict[player_id] = player_history[-25:]

    # Return only public projection
    return [
        {
            "id": s["id"],
            "title": s["title"],
            "description": s["description"],
            "category": s.get("category", "general"),
        }
        for s in selected
    ]
