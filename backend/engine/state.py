"""Game state creation, player ranking, leaderboard, and rulebook loading."""
from __future__ import annotations

import copy
import uuid

from .validate import validate_rule, check_max_rules


# --- Game creation -----------------------------------------------------------

def create_game(settings: dict, players: list[dict],
                rulebook: dict | None = None) -> dict:
    """Create a new game state.

    Args:
        settings: {board_size, dice_type, win_target, mode, max_rules,
                   amend_every}
        players: list of {id, name}
        rulebook: parsed rulebook dict (required for hybrid mode)

    Returns the full game state dict.
    """
    mode = settings["mode"]
    board_size = settings["board_size"]
    max_rules = settings["max_rules"]

    # Build player objects — all start at tile 1, score 0
    player_list = [
        {
            "id": p["id"],
            "name": p["name"],
            "position": 1,
            "score": 0,
            "skip_next": False,
        }
        for p in players
    ]

    # No base scoring rules - scoring happens only through player amendments
    # Movement is determined by dice rolls, scoring by rules

    # Initial phase: draft mode starts drafting, others start playing
    phase = "drafting" if mode == "draft" else "playing"

    # Hybrid mode: load rules from the provided rulebook
    rulebook_info = None
    extra_rules: list[dict] = []
    if mode == "hybrid":
        if rulebook is None:
            raise ValueError("Hybrid mode requires a rulebook")
        extra_rules, rulebook_info = load_rulebook(
            rulebook, board_size, max_rules)

    # Copy settings so the caller's dict isn't mutated
    settings_copy = dict(settings)

    state = {
        "game_id": str(uuid.uuid4()),
        "phase": phase,
        "settings": settings_copy,
        "players": player_list,
        "current_player": 0,
        "turn": 0,
        "last_roll": None,
        "moves_since_amend": 0,
        "last_actor_id": None,
        "rules": extra_rules,  # No R2 - only rulebook/amendment rules
        "log": [],
        "leaderboard": [],
        "winner": None,
        "rulebook_info": rulebook_info,
    }

    # Initial leaderboard — all last_delta = 0
    ranks = rank_players(player_list)
    state["leaderboard"] = build_leaderboard(
        player_list, ranks, acting_idx=-1, acting_delta=0,
        old_leaderboard=[],
    )
    return state


# --- Ranking -----------------------------------------------------------------

def rank_players(players: list[dict]) -> list[int]:
    """Return competition ranking for each player (by index into players).

    Tied players share the same rank; next rank skips.
    Scores [10, 5, 5, 3] → ranks [1, 2, 2, 4].
    """
    n = len(players)
    if n == 0:
        return []

    scores = [p["score"] for p in players]
    sorted_indices = sorted(range(n), key=lambda i: -scores[i])

    ranks = [0] * n
    for pos, idx in enumerate(sorted_indices):
        if pos > 0 and scores[idx] == scores[sorted_indices[pos - 1]]:
            ranks[idx] = ranks[sorted_indices[pos - 1]]
        else:
            ranks[idx] = pos + 1  # competition ranking: 1-indexed
    return ranks


# --- Leaderboard -------------------------------------------------------------

def build_leaderboard(players: list[dict], ranks: list[int],
                      acting_idx: int, acting_delta: int,
                      old_leaderboard: list[dict]) -> list[dict]:
    """Build a new leaderboard.

    acting_idx: index of the player whose last_delta to update (-1 = initial).
    acting_delta: the new last_delta value for the acting player.
    old_leaderboard: previous leaderboard (preserves other players' deltas).
    """
    old_deltas = {e["player_id"]: e["last_delta"]
                  for e in old_leaderboard}

    leaderboard = []
    for i, p in enumerate(players):
        delta = acting_delta if i == acting_idx else old_deltas.get(p["id"], 0)
        leaderboard.append({
            "player_id": p["id"],
            "name": p["name"],
            "score": p["score"],
            "rank": ranks[i],
            "last_delta": delta,
        })
    return leaderboard


# --- Rulebook loading (hybrid mode) ------------------------------------------

def select_rulebook(rulebooks: list[dict], board_size: int, rng) -> dict:
    """Pick a rulebook compatible with board_size using the injected RNG.

    A rulebook is compatible if board_size is in its board_sizes list,
    or if board_sizes is empty/absent (means all sizes).

    Raises ValueError if no compatible rulebook exists.
    """
    compatible = [
        rb for rb in rulebooks
        if not rb.get("board_sizes") or board_size in rb["board_sizes"]
    ]
    if not compatible:
        raise ValueError(
            f"No compatible rulebook found for board_size {board_size}")
    return rng.choice(compatible)


def load_rulebook(rulebook: dict, board_size: int, max_rules: int
                  ) -> tuple[list[dict], dict]:
    """Load, filter, and truncate a rulebook for hybrid mode.

    Returns (loaded_rules, rulebook_info):
        loaded_rules: rule objects with immutable=False, IDs A1..An
        rulebook_info: {name, total_rules, filtered, truncated, loaded}

    Invariants:
        total_rules = filtered + truncated + loaded
        loaded <= max_rules - 1
        len(state.rules) will be loaded + 1 (R2 + loaded rules)
    """
    name = rulebook.get("name", "unknown")
    raw_rules = rulebook.get("rules", [])
    total_rules = len(raw_rules)

    # Step 1: filter out board-incompatible rules
    valid: list[dict] = []
    filtered = 0
    for rule in raw_rules:
        if _is_rule_board_compatible(rule, board_size):
            valid.append(rule)
        else:
            filtered += 1

    # Step 2: truncate to available slots (max_rules - 1, R2 takes 1)
    available = max(0, max_rules - 1)
    if len(valid) > available:
        truncated = len(valid) - available
        to_load = valid[:available]
    else:
        truncated = 0
        to_load = valid

    # Step 3: assign IDs, force immutable=False, ensure source field
    loaded: list[dict] = []
    for i, rule in enumerate(to_load):
        r = copy.deepcopy(rule)
        r["id"] = rule.get("id") or f"A{i + 1}"
        r["immutable"] = False  # override file value
        if "source" not in r:
            r["source"] = f"Rulebook: {name}"
        loaded.append(r)

    rulebook_info = {
        "name": name,
        "total_rules": total_rules,
        "filtered": filtered,
        "truncated": truncated,
        "loaded": len(loaded),
    }
    return loaded, rulebook_info


def _is_rule_board_compatible(rule: dict, board_size: int) -> bool:
    """Check if a rule is compatible with the given board size.

    Currently always returns True — our predicate/effect format does not
    reference specific tile numbers.  Exists for future extensibility.
    """
    # Future: check predicates/effects for tile references > board_size²
    return True


# --- Amendment adding (used by Phase 2 server) -------------------------------

def add_amendment(state: dict, rule: dict) -> tuple[bool, str | None]:
    """Validate and append an amendment rule to state.rules.

    Returns (True, None) if added, (False, error_message) if rejected.
    """
    valid, error = validate_rule(rule)
    if not valid:
        return False, error

    if not check_max_rules(state):
        return False, f"Max rules ({state['settings']['max_rules']}) reached"

    # Assign amendment ID (A1, A2, … based on existing amendment count)
    amend_count = sum(1 for r in state["rules"] if r["id"].startswith("A"))
    r = copy.deepcopy(rule)
    r["id"] = f"A{amend_count + 1}"
    r["immutable"] = False
    if "source" not in r:
        r["source"] = ""
    state["rules"].append(r)
    return True, None
