"""Turn execution and rule interpreter.

The engine processes a turn in this order:
  1. on_turn_start  — fire rules (check skip_next first)
  2. roll dice      — store last_roll
  3. on_roll        — fire rules (may adjust movement or reroll)
  4. move (R1)      — move player by last_roll + adjustments, wrap-around
  5. on_land        — fire rules including R2 (+1 score)
  6. win_check      — fire rules, then engine checks score >= win_target (R3)
  7. finalization   — last_delta, leaderboard, advance turn (or freeze if done)

Each rule fires at most once per trigger phase per turn.  Effects never
re-trigger rules in the same or earlier phases (no chaining).
"""
from __future__ import annotations

from .board import is_prime
from .dice import roll_dice
from .state import rank_players, build_leaderboard
from .validate import clamp_amount, clamp_win_target


# --- Public API ---------------------------------------------------------------

def execute_turn(state: dict, rng) -> dict:
    """Execute one full turn for the current player.

    Mutates ``state`` in place and returns it.
    ``rng`` is an injectable random.Random for deterministic tests.
    """
    players = state["players"]
    acting_idx = state["current_player"]
    acting_player = players[acting_idx]
    turn = state["turn"]

    # Capture score at turn start, before any effects execute.
    score_at_turn_start = acting_player["score"]

    # --- Skip check (before any rules fire) ---
    if acting_player["skip_next"]:
        acting_player["skip_next"] = False
        state["turn"] = turn + 1            # time passes
        # moves_since_amend NOT incremented (no move completed)
        ranks = rank_players(players)
        state["leaderboard"] = build_leaderboard(
            players, ranks, acting_idx, 0, state["leaderboard"])
        state["current_player"] = (acting_idx + 1) % len(players)
        return state  # no rules fire, no log entries

    # --- Draft → playing transition on first roll ---
    if state["phase"] == "drafting":
        state["phase"] = "playing"

    # --- Shared context passed through all phases ---
    ctx = {
        "player_idx": acting_idx,
        "players": players,
        "rng": rng,
        "reroll_used": False,
        "move_adjustment": 0,
        "last_roll": None,
        "trigger": None,
        "ranks": rank_players(players),
        "rule_id": None,
    }

    # --- Step 1: on_turn_start ---
    ctx["trigger"] = "on_turn_start"
    _fire_rules(state, ctx, "on_turn_start", turn)

    # --- Step 2: roll dice ---
    state["last_roll"] = roll_dice(state["settings"]["dice_type"], rng)
    ctx["last_roll"] = state["last_roll"]

    # When you roll the dice, the points on the dice are added to your total points
    acting_player["score"] += state["last_roll"]

    # --- Step 3: on_roll ---
    ctx["trigger"] = "on_roll"
    _fire_rules(state, ctx, "on_roll", turn)

    # --- Step 4: move (R1 hardcoded) ---
    n = state["settings"]["board_size"] ** 2
    total = state["last_roll"] + ctx["move_adjustment"]
    old_pos = acting_player["position"]
    acting_player["position"] = ((old_pos - 1 + total) % n) + 1

    # --- Step 5: on_land (includes R2) ---
    ctx["trigger"] = "on_land"
    _fire_rules(state, ctx, "on_land", turn)

    # --- Step 6: win_check ---
    ctx["trigger"] = "win_check"
    _fire_rules(state, ctx, "win_check", turn)

    # Engine win check (R3 hardcoded): any player at/above win_target wins.
    win_target = state["settings"]["win_target"]
    for p in players:
        if p["score"] >= win_target:
            state["winner"] = p["id"]
            state["phase"] = "finished"
            break

    # Record the actor for the completed normal turn.
    state["last_actor_id"] = acting_player["id"]

    # --- Step 7: finalization ---
    last_delta = acting_player["score"] - score_at_turn_start
    ranks = rank_players(players)
    state["leaderboard"] = build_leaderboard(
        players, ranks, acting_idx, last_delta, state["leaderboard"])

    if state["phase"] != "finished":
        state["turn"] = turn + 1
        state["moves_since_amend"] += 1
        state["current_player"] = (acting_idx + 1) % len(players)
    # If finished: do NOT increment turn / moves_since_amend / advance player.

    return state


# --- Rule firing ---------------------------------------------------------------

def _fire_rules(state: dict, ctx: dict, trigger: str, turn: int) -> None:
    """Fire all active rules matching *trigger* in index order."""
    players = state["players"]

    # Collect rules matching this trigger
    matching = [(i, r) for i, r in enumerate(state["rules"])
                if r["trigger"] == trigger]

    # Determine active set via conflict resolution
    active = _get_active_rules(matching)

    for _idx, rule in active:
        ctx["rule_id"] = rule["id"]
        ctx["ranks"] = rank_players(players)  # recalculate before each rule

        if _evaluate_condition(rule["condition"], ctx):
            _apply_effect(rule["effect"], state, ctx, turn)


# --- Conflict Key & Condition Normalization -----------------------------------

def normalize_predicate(pred: dict) -> tuple:
    """Normalize a predicate dict into a deterministic, hashable tuple.

    Handles sorting of args dictionary if present.
    """
    name = pred.get("name", "")
    args = pred.get("args") or {}
    args_tuple = tuple(sorted((str(k), v) for k, v in args.items()))
    return (name, args_tuple)


def normalize_condition(condition: dict | None) -> tuple:
    """Normalize a rule condition dict into a deterministic, hashable tuple.

    - Empty predicates, missing condition, or None normalize to ("always", ()).
    - A single predicate normalizes to ("single", ((name, args),)).
      Note: with 1 predicate, mode 'all' and 'any' evaluate identically.
    - Multiple predicates normalize to (mode, sorted_unique_predicates).
    """
    if not condition:
        return ("always", ())

    preds = condition.get("predicates") or []
    if not preds:
        return ("always", ())

    normalized_preds = set(normalize_predicate(p) for p in preds)
    sorted_preds = tuple(sorted(normalized_preds))

    if len(sorted_preds) == 1:
        return ("single", sorted_preds)

    mode = condition.get("mode", "all")
    return (mode, sorted_preds)


def get_rule_conflict_key(rule: dict) -> tuple:
    """Return the conflict identity key for a rule:
    (trigger, effect_type, effect_target, normalized_condition).

    Rules conflict when their trigger, effect type, target, and logical conditions
    are equivalent, but their effect amounts or values differ. Rules with different
    conditions produce distinct keys and coexist.
    """
    trigger = rule.get("trigger")
    effect = rule.get("effect", {})
    etype = effect.get("type")
    target = effect.get("target", "self")
    norm_cond = normalize_condition(rule.get("condition"))
    return (trigger, etype, target, norm_cond)


def _get_active_rules(matching: list[tuple[int, dict]]) -> list[tuple[int, dict]]:
    """Determine which rules fire, based on condition-aware conflict resolution.

    Conflict key = (trigger, effect.type, target, normalized_condition).
    For each key:
      - immutable rules are always active;
      - among non-immutable rules, only the newest (highest index) is active.
    All active rules fire; their effects stack.
    """
    # Group by condition-aware conflict key
    groups: dict[tuple, list[tuple[int, dict]]] = {}
    for idx, rule in matching:
        key = get_rule_conflict_key(rule)
        groups.setdefault(key, []).append((idx, rule))

    active: list[tuple[int, dict]] = []
    for _key, rules_with_key in groups.items():
        rules_with_key.sort(key=lambda x: x[0])  # oldest first

        # Immutable rules always active
        for idx, rule in rules_with_key:
            if rule.get("immutable"):
                active.append((idx, rule))

        # Newest non-immutable is active (older ones suppressed)
        non_immutable = [(i, r) for i, r in rules_with_key
                         if not r.get("immutable")]
        if non_immutable:
            active.append(non_immutable[-1])

    active.sort(key=lambda x: x[0])  # fire in index order
    return active


# --- Condition / predicate evaluation -----------------------------------------

def _evaluate_condition(condition: dict, ctx: dict) -> bool:
    """Evaluate a rule's condition (all/any of predicates)."""
    preds = condition.get("predicates", [])
    if not preds:
        return True  # empty = always true

    mode = condition.get("mode", "all")
    results = [_evaluate_predicate(p, ctx) for p in preds]
    return all(results) if mode == "all" else any(results)


def _evaluate_predicate(pred: dict, ctx: dict) -> bool:
    """Evaluate a single predicate against the current context."""
    name = pred["name"]
    players = ctx["players"]
    idx = ctx["player_idx"]
    player = players[idx]
    ranks = ctx["ranks"]

    if name == "is_leader":
        return ranks[idx] == 1

    if name == "is_last":
        return ranks[idx] == max(ranks) if ranks else False

    if name == "roll_is_even":
        roll = ctx.get("last_roll")
        return roll is not None and roll % 2 == 0

    if name == "tile_is_prime":
        return is_prime(player["position"])

    if name == "score_gt":
        value = pred.get("args", {}).get("value", 0)
        return player["score"] > value

    raise ValueError(f"Unknown predicate: {name!r}")


# --- Target resolution --------------------------------------------------------

def _resolve_targets(target: str, acting_idx: int,
                      players: list[dict], ranks: list[int]) -> list[int]:
    """Resolve a target string to a list of player indices."""
    if target == "self":
        return [acting_idx]
    if target == "leader":
        return [i for i in range(len(players)) if ranks[i] == 1]
    if target == "last":
        mx = max(ranks) if ranks else 0
        return [i for i in range(len(players)) if ranks[i] == mx]
    if target == "all_others":
        return [i for i in range(len(players)) if i != acting_idx]
    raise ValueError(f"Unknown target: {target!r}")


def _resolve_steal_target(target: str, acting_idx: int,
                          players: list[dict], ranks: list[int]) -> int | None:
    """Resolve to a single non-self target index for steal_score.

    Returns the first non-self target by players[] index, or None.
    """
    targets = _resolve_targets(target, acting_idx, players, ranks)
    non_self = [i for i in targets if i != acting_idx]
    if not non_self:
        return None
    return min(non_self)


# --- Effect application -------------------------------------------------------

def _apply_effect(effect: dict, state: dict, ctx: dict, turn: int) -> None:
    """Apply an effect and append a log entry."""
    players = state["players"]
    acting_idx = ctx["player_idx"]
    acting = players[acting_idx]
    score_before = acting["score"]  # acting player's score before effect

    etype = effect["type"]
    amount = effect.get("amount", 0)
    target = effect.get("target", "self")
    ranks = ctx["ranks"]
    trigger = ctx["trigger"]

    if etype == "add_score":
        clamped = clamp_amount(amount)
        tis = _resolve_targets(target, acting_idx, players, ranks)
        for ti in tis:
            players[ti]["score"] = max(0, players[ti]["score"] + clamped)
        details = None
        if target != "self" and tis:
            details = f"targets: {', '.join(players[ti]['id'] for ti in tis)}"

    elif etype == "steal_score":
        steal_amt = abs(clamp_amount(amount))
        si = _resolve_steal_target(target, acting_idx, players, ranks)
        if si is None:
            details = "no-op (self-target or no valid target)"
        else:
            tgt = players[si]
            actual = min(steal_amt, tgt["score"])
            tgt["score"] -= actual
            acting["score"] += actual
            details = f"stole {actual} from {tgt['id']}"

    elif etype == "move":
        clamped = clamp_amount(amount)
        if trigger == "on_roll" and target == "self":
            # Adjustment — added to dice movement in step 4
            ctx["move_adjustment"] += clamped
            details = f"adjustment {clamped:+d}"
        else:
            # Immediate reposition — no events triggered
            tis = _resolve_targets(target, acting_idx, players, ranks)
            n = state["settings"]["board_size"] ** 2
            parts = []
            for ti in tis:
                old = players[ti]["position"]
                new = ((old - 1 + clamped) % n) + 1
                players[ti]["position"] = new
                parts.append(f"{players[ti]['id']} pos {old}→{new}")
            details = "; ".join(parts)

    elif etype == "skip_turn":
        tis = _resolve_targets(target, acting_idx, players, ranks)
        for ti in tis:
            players[ti]["skip_next"] = True
        details = f"target: {', '.join(players[ti]['id'] for ti in tis)}"

    elif etype == "reroll":
        if ctx.get("reroll_used", False):
            details = "no-op (reroll already used)"
        else:
            old = state["last_roll"]
            new = roll_dice(state["settings"]["dice_type"], ctx["rng"])
            state["last_roll"] = new
            acting["score"] += (new - old)
            ctx["reroll_used"] = True
            ctx["last_roll"] = new
            details = f"roll {old}→{new}"

    elif etype == "set_win_target":
        clamped = clamp_win_target(amount)
        old_t = state["settings"]["win_target"]
        state["settings"]["win_target"] = clamped
        details = f"win_target {old_t}→{clamped}"

    else:
        raise ValueError(f"Unknown effect type: {etype!r}")

    score_after = acting["score"]

    state["log"].append({
        "turn": turn,
        "player": acting["id"],
        "rule_id": ctx["rule_id"],
        "effect": etype,
        "before": score_before,
        "after": score_after,
        "details": details,
    })
