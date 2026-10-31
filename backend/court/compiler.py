"""
Natural language amendment compiler.

Transforms player-written English text into validated rule JSON using an LLM.
"""
from __future__ import annotations


import json
import re
from typing import Dict, Any, Optional, Callable

from backend.court.providers import (
    get_provider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError,
    ProviderModelNotFoundError,
)
from backend.court.config import CourtConfig
from backend.engine.validate import (
    VALID_TRIGGERS,
    VALID_EFFECT_TYPES,
    VALID_TARGETS,
    VALID_PREDICATES,
    AMOUNT_CAP,
    WIN_TARGET_MIN,
    WIN_TARGET_MAX,
)


from backend.court.schema import RULE_JSON_SCHEMA


# ---------------------------------------------------------------------------
# Court prompt template
# ---------------------------------------------------------------------------
# Values are derived from validate.py constants at build-time (single source
# of truth).  The prompt lists the allowed enums so the model knows the
# vocabulary, but the engine validator is the final authority.
_TRIGGER_LIST = ", ".join(sorted(VALID_TRIGGERS))
_EFFECT_LIST = ", ".join(sorted(VALID_EFFECT_TYPES))
_TARGET_LIST = ", ".join(sorted(VALID_TARGETS))
_PREDICATE_LIST = ", ".join(sorted(VALID_PREDICATES))

SYSTEM_PROMPT = """You are the Court in AMENDMENT, a board game where players propose rule changes in plain English.

Your role: Convert the player's amendment text into exactly ONE rule object matching this JSON schema.

# RULE SCHEMA

A rule has:
- trigger: when it fires ({triggers})
- condition: when it applies (mode: all|any, predicates: array)
- effect: what it does (type, amount, target)
- source: the original text

# VALID ENUMS

Triggers: {triggers}

Predicates:
- is_leader (no args)
- is_last (no args)
- roll_is_even (no args, not valid for on_turn_start)
- tile_is_prime (no args)
- score_gt (requires args: {{"value": int}})

Effect types:
- add_score (amount ±{amount_cap}, target)
- steal_score (amount abs(±{amount_cap}), target != self)
- move (amount ±{amount_cap}, target)
- skip_turn (amount 0, target)
- reroll (amount 0, target self)
- set_win_target (amount {win_target_min}-{win_target_max}, target: self)

Targets: {targets}

# CURRENT GAME STATE

Board size: {board_size} tiles (total: {total_tiles})
Dice type: {dice_type}
Win target: {win_target}
Current rules: {rule_count} (max: {max_rules})

# RULES

1. Output ONLY valid JSON.
2. Never invent triggers, predicates, or effects outside the allowed enums.
3. Never clamp or silently change a requested effect amount. Preserve the original amount so validation can reject values outside allowed limits.
4. First determine whether the input describes a change to gameplay.
5. If the input does not describe a gameplay rule, output exactly:
{{"not_a_game_rule": true, "reason": "This is not a game rule. Please propose a rule that changes the gameplay."}}
6. Examples of inputs that are NOT game rules: "fuck you", "suck my dick", "hello", "what is your name?"
7. If the input describes a gameplay rule, output the normal rule JSON specified by the schema.
8. Do not classify a gameplay rule as a non-game-rule merely because it violates a game constraint.
9. Invalid amounts, unsupported effects, and other rule violations must be rejected by validation with a specific reason.
10. Reject rules naming specific players.
11. Reject meta-rules that void other rules or bypass the game's logic.
12. Reject rules referencing tiles beyond {total_tiles}.
13. Keep responses concise and follow the required JSON format.
Output exactly this JSON structure:

{{
  "trigger": "on_land",
  "condition": {{
    "mode": "all",
    "predicates": []
  }},
  "effect": {{
    "type": "add_score",
    "amount": 2,
    "target": "self"
  }},
  "source": "original text"
}}

No extra text. No markdown fences. Just JSON.

# EXAMPLES

Input: "When you land, gain 2 extra points"
Output: {{"trigger": "on_land", "condition": {{"mode": "all", "predicates": []}}, "effect": {{"type": "add_score", "amount": 2, "target": "self"}}, "source": "When you land, gain 2 extra points"}}

Input: "When you roll an even number, gain 3 points"
Output: {{"trigger": "on_roll", "condition": {{"mode": "all", "predicates": [{{"name": "roll_is_even"}}]}}, "effect": {{"type": "add_score", "amount": 3, "target": "self"}}, "source": "When you roll an even number, gain 3 points"}}

Input: "When you land and you're in last place, steal 2 points from the leader"
Output: {{"trigger": "on_land", "condition": {{"mode": "all", "predicates": [{{"name": "is_last"}}]}}, "effect": {{"type": "steal_score", "amount": 2, "target": "leader"}}, "source": "When you land and you're in last place, steal 2 points from the leader"}}

Input: "If your score is above 10, move back 3 spaces on landing"
Output: {{"trigger": "on_land", "condition": {{"mode": "all", "predicates": [{{"name": "score_gt", "args": {{"value": 10}}}}]}}, "effect": {{"type": "move", "amount": -3, "target": "self"}}, "source": "If your score is above 10, move back 3 spaces on landing"}}

Input: "All rules are void"
REJECT: Meta-rule that voids other rules

Input: "I win immediately"
REJECT: Meta-rule that circumvents game logic

Input: "When Alice lands on tile 50, she gets 100 points"
REJECT: Names specific player (Alice)
"""


def build_system_prompt(state: Dict[str, Any]) -> str:
    """
    Build the system prompt with game state context.

    Args:
        state: Current game state

    Returns:
        Formatted system prompt
    """
    settings = state.get("settings", {})
    board_size = settings.get("board_size", 6)
    total_tiles = board_size * board_size
    dice_type = settings.get("dice_type", "1d6")
    win_target = settings.get("win_target", 10)
    max_rules = settings.get("max_rules", 8)
    rule_count = len(state.get("rules", []))

    return SYSTEM_PROMPT.format(
        board_size=board_size,
        total_tiles=total_tiles,
        dice_type=dice_type,
        win_target=win_target,
        rule_count=rule_count,
        max_rules=max_rules,
        triggers=_TRIGGER_LIST,
        targets=_TARGET_LIST,
        amount_cap=AMOUNT_CAP,
        win_target_min=WIN_TARGET_MIN,
        win_target_max=WIN_TARGET_MAX,
    )


def extract_json(text: str) -> Optional[str]:
    """
    Extract JSON from LLM response, handling markdown code fences.

    Args:
        text: LLM response text

    Returns:
        Extracted JSON string or None if not found
    """
    # Try to find JSON in markdown code fences
    fenced_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if fenced_match:
        return fenced_match.group(1).strip()

    # Try to find raw JSON object
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        return json_match.group(0).strip()

    return None


def parse_json_safely(text: str) -> Optional[Dict[str, Any]]:
    """
    Parse JSON safely without using eval.

    Args:
        text: JSON string

    Returns:
        Parsed dict or None if invalid
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _requested_effect_amount(text: str) -> tuple[int, str] | None:
    """Extract an explicitly requested effect amount without reading condition numbers."""
    patterns = [
        (
            r"\b(?:set|change|make)\s+(?:the\s+)?win(?:ning)?\s+target"
            r"\s+(?:to|at|of)\s+(-?\d+)\b",
            "win_target",
        ),
        (
            r"\b(?:give|award|add|gain|earn|steal|take)"
            r"(?:\s+\w+){0,4}?\s+(-?\d+)\s+(?:points?|pts?)\b",
            "effect",
        ),
        (
            r"\b(?:move|advance)"
            r"(?:\s+\w+){0,3}?\s+(-?\d+)\s+(?:spaces?|tiles?|steps?)\b",
            "effect",
        ),
    ]

    for pattern, kind in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1)), kind

    return None


def _requested_amount_error(text: str, rule: dict) -> str | None:
    """
    Reject capped amounts or an AI-generated amount that differs from the request.

    Limits come from validate.py (single source of truth):
      AMOUNT_CAP = ±5 for regular effects
      WIN_TARGET_MIN..WIN_TARGET_MAX for set_win_target
    """
    requested = _requested_effect_amount(text)
    if requested is None:
        return None

    amount, kind = requested

    if kind == "win_target":
        if not WIN_TARGET_MIN <= amount <= WIN_TARGET_MAX:
            return (
                f"set_win_target {amount} outside "
                f"{WIN_TARGET_MIN}..{WIN_TARGET_MAX}"
            )
        expected_type = "set_win_target"
    else:
        if abs(amount) > AMOUNT_CAP:
            return f"Effect amount {amount} exceeds ±{AMOUNT_CAP} cap"

        effect = rule.get("effect")
        if not isinstance(effect, dict):
            return None
        expected_type = effect.get("type")

    effect = rule.get("effect")
    if not isinstance(effect, dict):
        return None

    if effect.get("type") != expected_type:
        return (
            f"Requested effect amount {amount}, but the generated rule "
            f"uses effect type {effect.get('type')!r}"
        )

    generated_amount = effect.get("amount")
    if isinstance(generated_amount, int) and not isinstance(generated_amount, bool):
        if generated_amount != amount:
            return (
                f"Court changed the requested effect amount "
                f"(requested {amount}, generated {generated_amount})"
            )

    return None


def compile_amendment(
    text: str,
    state: Dict[str, Any],
    validate_rule_fn: Optional[Callable[[Dict[str, Any]], tuple[bool, Optional[str]]]] = None,
) -> Dict[str, Any]:
    """
    Compile a natural language amendment into a validated rule.

    Args:
        text: Player's amendment text
        state: Current game state
        validate_rule_fn: Optional validation function (for dependency injection in tests)

    Returns:
        Court response dict with keys:
        - accepted (bool): True if compilation succeeded
        - rule (dict|None): The compiled rule (without id/immutable) or None
        - error (str|None): Error message if rejected or None
        - category (str): 'accepted', 'not_a_game_rule', 'invalid_rule', or 'court_error'
    """
    trimmed = text.strip() if text else ""
    if not trimmed:
        return {
            "accepted": False,
            "category": "not_a_game_rule",
            "rule": None,
            "error": "Proposal text cannot be empty. Please propose a rule that changes the gameplay.",
        }

    MAX_PROPOSAL_LENGTH = 500
    if len(trimmed) > MAX_PROPOSAL_LENGTH:
        return {
            "accepted": False,
            "category": "not_a_game_rule",
            "rule": None,
            "error": f"Proposal text exceeds maximum length of {MAX_PROPOSAL_LENGTH} characters.",
        }

    # Build system prompt with game context
    system_prompt = build_system_prompt(state)

    # Get the provider
    try:
        provider = get_provider()
    except Exception as e:
        return {
            "accepted": False,
            "category": "court_error",
            "rule": None,
            "error": f"Provider initialization failed: {e}",
        }

    # Check provider availability with specific failure reasons
    checked = False
    avail_fn = getattr(provider, "availability_detail", None)
    if callable(avail_fn):
        try:
            res = avail_fn()
            if isinstance(res, (tuple, list)) and len(res) == 3:
                reachable, model_ok, detail_msg = res
                checked = True
                if not reachable or not model_ok:
                    return {
                        "accepted": False,
                        "category": "court_error",
                        "rule": None,
                        "error": detail_msg,
                    }
        except Exception:
            pass

    if not checked and not provider.is_available():
        return {
            "accepted": False,
            "category": "court_error",
            "rule": None,
            "error": "Court AI provider is not available",
        }

    # Attempt generation with retries
    max_retries = CourtConfig.MAX_RETRIES
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            # Generate response with structured output schema
            response = provider.generate(
                prompt=f"Amendment text: {text}",
                system_prompt=system_prompt,
                json_schema=RULE_JSON_SCHEMA,
            )

            # Extract JSON (fallback for providers that don't use structured output)
            json_str = extract_json(response)
            if not json_str:
                last_error = "Could not extract JSON from response"
                continue

            # Parse JSON
            rule = parse_json_safely(json_str)
            if rule is None:
                last_error = "Invalid JSON format"
                continue

            # Validate response type
            if not isinstance(rule, dict):
                last_error = "Response is not a JSON object"
                continue

            # Check whether the input is a game rule at all
            if rule.get("not_a_game_rule") is True:
                return {
                    "accepted": False,
                    "category": "not_a_game_rule",
                    "rule": None,
                    "error": "This is not a game rule. Please propose a rule that changes the gameplay.",
                }

            # Ensure the generated rule preserves an explicitly requested effect amount.
            amount_error = _requested_amount_error(text, rule)
            if amount_error:
                return {
                    "accepted": False,
                    "category": "invalid_rule",
                    "rule": None,
                    "error": f"Invalid rule: {amount_error}",
                }

            # Add source if missing
            if "source" not in rule:
                rule["source"] = text

            # Normalize set_win_target target to "self" if missing or set to "ignored"
            if isinstance(rule.get("effect"), dict) and rule["effect"].get("type") == "set_win_target":
                if rule["effect"].get("target") in (None, "", "ignored") or rule["effect"].get("target") not in VALID_TARGETS:
                    rule["effect"]["target"] = "self"

            # Validate the rule structure using engine validator if provided
            if validate_rule_fn:
                valid, error_msg = validate_rule_fn(rule)
                if not valid:
                    return {
                        "accepted": False,
                        "category": "invalid_rule",
                        "rule": None,
                        "error": f"Invalid rule: {error_msg}",
                    }

            # Success!
            return {
                "accepted": True,
                "category": "accepted",
                "rule": rule,
                "error": None,
            }

        except ProviderTimeoutError as e:
            return {
                "accepted": False,
                "category": "court_error",
                "rule": None,
                "error": (
                    "The local AI model (Ollama) is unavailable or timed out. "
                    "Match state remains unchanged."
                ),
            }
        except ProviderConnectionError as e:
            return {
                "accepted": False,
                "category": "court_error",
                "rule": None,
                "error": str(e),
            }
        except ProviderModelNotFoundError as e:
            return {
                "accepted": False,
                "category": "court_error",
                "rule": None,
                "error": str(e),
            }
        except ProviderError as e:
            return {
                "accepted": False,
                "category": "court_error",
                "rule": None,
                "error": f"Court provider error: {e}",
            }
        except Exception as e:
            last_error = f"Unexpected error: {e}"
            continue

    # All retries exhausted
    return {
        "accepted": False,
        "category": "court_error",
        "rule": None,
        "error": f"Failed to compile after {max_retries + 1} attempts. Last error: {last_error}",
    }
