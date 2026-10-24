"""Rule validation, caps, max_rules enforcement, amend eligibility."""

# --- Constants ---------------------------------------------------------------

VALID_TRIGGERS = {"on_turn_start", "on_roll", "on_land", "win_check"}
VALID_EFFECT_TYPES = {"add_score", "steal_score", "move",
                      "skip_turn", "reroll", "set_win_target"}
VALID_TARGETS = {"self", "leader", "last", "all_others"}
VALID_PREDICATES = {"is_leader", "is_last", "roll_is_even",
                    "tile_is_prime", "score_gt"}
VALID_CONDITION_MODES = {"all", "any"}

AMOUNT_CAP = 5          # effect amounts clamped to ±5
WIN_TARGET_MIN = 5
WIN_TARGET_MAX = 50


# --- Validation ---------------------------------------------------------------

def validate_rule(rule: dict) -> tuple[bool, str | None]:
    """Validate a rule against the schema.

    Returns (True, None) if valid, (False, error_message) if invalid.
    """
    # trigger
    if "trigger" not in rule:
        return False, "Missing 'trigger'"
    if rule["trigger"] not in VALID_TRIGGERS:
        return False, f"Invalid trigger: {rule['trigger']!r}"

    # condition
    if "condition" not in rule:
        return False, "Missing 'condition'"
    condition = rule["condition"]
    mode = condition.get("mode")
    if mode not in VALID_CONDITION_MODES:
        return False, f"Invalid condition.mode: {mode!r}"
    for pred in condition.get("predicates", []):
        if "name" not in pred:
            return False, "Predicate missing 'name'"
        if pred["name"] not in VALID_PREDICATES:
            return False, f"Invalid predicate: {pred['name']!r}"
        if pred["name"] == "score_gt":
            args = pred.get("args", {})
            if "value" not in args or not isinstance(args["value"], int):
                return False, "score_gt requires args.value (int)"

    # effect
    if "effect" not in rule:
        return False, "Missing 'effect'"
    effect = rule["effect"]
    if "type" not in effect or effect["type"] not in VALID_EFFECT_TYPES:
        return False, f"Invalid effect.type: {effect.get('type')!r}"
    if "amount" not in effect or not isinstance(effect["amount"], int):
        return False, "Missing or non-int effect.amount"
    if "target" not in effect or effect["target"] not in VALID_TARGETS:
        return False, f"Invalid effect.target: {effect.get('target')!r}"

    # caps (validate, don't clamp here)
    if effect["type"] == "set_win_target":
        if not (WIN_TARGET_MIN <= effect["amount"] <= WIN_TARGET_MAX):
            return False, (f"set_win_target {effect['amount']} "
                           f"outside {WIN_TARGET_MIN}..{WIN_TARGET_MAX}")
    else:
        if abs(effect["amount"]) > AMOUNT_CAP:
            return False, (f"Effect amount {effect['amount']} "
                           f"exceeds ±{AMOUNT_CAP} cap")

    return True, None


# --- Clamps -------------------------------------------------------------------

def clamp_amount(amount: int) -> int:
    """Clamp effect amount to ±AMOUNT_CAP."""
    return max(-AMOUNT_CAP, min(AMOUNT_CAP, amount))


def clamp_win_target(value: int) -> int:
    """Clamp win_target to WIN_TARGET_MIN..WIN_TARGET_MAX."""
    return max(WIN_TARGET_MIN, min(WIN_TARGET_MAX, value))


# --- Max rules ----------------------------------------------------------------

def check_max_rules(state: dict) -> bool:
    """Return True if there's room for one more rule."""
    return len(state["rules"]) < state["settings"]["max_rules"]


# --- Amend eligibility --------------------------------------------------------

def can_amend(state: dict) -> tuple[bool, str | None]:
    """Check if an amendment is allowed right now.

    Returns (True, None) if allowed, (False, reason) if not.
    """
    if state["phase"] == "finished":
        return False, "Game is finished"

    mode = state["settings"]["mode"]

    if mode == "draft":
        if state["phase"] == "drafting":
            return True, None
        return False, "Drafting phase is over"

    if mode == "live":
        amend_every = state["settings"].get("amend_every") or 1
        if state["moves_since_amend"] >= amend_every:
            return True, None
        return False, (f"Amend not available "
                       f"(moves_since_amend={state['moves_since_amend']}, "
                       f"need {amend_every})")

    if mode == "hybrid":
        return False, "Amendments not allowed in hybrid mode"

    return False, f"Unknown mode: {mode!r}"
