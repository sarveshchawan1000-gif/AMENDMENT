"""
Natural language amendment compiler.

Transforms player-written English text into validated rule JSON using an LLM.
"""
from __future__ import annotations


import json
import re
import threading
from typing import Dict, Any, Optional, Callable, Tuple

from backend.court.providers import (
    get_provider,
    get_fallback_provider,
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError,
    ProviderModelNotFoundError,
    ProviderRateLimitError,
    ProviderAuthError,
    ProviderPermissionError,
    ProviderInvalidRequestError,
    ProviderServerError,
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
from backend.court.cache import rule_cache, compute_cache_key, RuleCache


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


class SingleFlight:
    """
    Suppresses duplicate concurrent compilation requests for the identical cache key.
    The first request becomes leader; subsequent concurrent requests wait for the
    leader to complete and write to persistent cache, then return directly from cache.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._in_flight: Dict[str, threading.Event] = {}

    def acquire(self, key: str) -> Tuple[bool, threading.Event]:
        with self._lock:
            if key in self._in_flight:
                return False, self._in_flight[key]
            event = threading.Event()
            self._in_flight[key] = event
            return True, event

    def release(self, key: str) -> None:
        with self._lock:
            event = self._in_flight.pop(key, None)
            if event:
                event.set()


_single_flight = SingleFlight()


def _compile_with_provider(
    provider: LLMProvider,
    text: str,
    system_prompt: str,
    validate_rule_fn: Optional[Callable[[Dict[str, Any]], tuple[bool, Optional[str]]]] = None,
    allow_retries: bool = True,
) -> Tuple[bool, Optional[Dict[str, Any]], str, Optional[str], bool]:
    """
    Attempt compilation against a specific provider with bounded retries and error classification.

    Returns:
        (success, rule_or_none, category, error_message, is_fallback_eligible)
    """
    # 1. Availability check if supported
    avail_fn = getattr(provider, "availability_detail", None)
    if callable(avail_fn):
        try:
            res = avail_fn()
            if isinstance(res, (tuple, list)) and len(res) == 3:
                reachable, model_ok, detail_msg = res
                if not reachable or not model_ok:
                    # Missing API key / bad configuration is NOT fallback eligible (Requirement 7)
                    if "missing" in detail_msg.lower() or "api key" in detail_msg.lower():
                        return False, None, "court_error", detail_msg, False
                    return False, None, "court_error", detail_msg, True
        except Exception:
            pass

    if not getattr(provider, "is_available", lambda: True)():
        return (
            False,
            None,
            "court_error",
            f"Court AI provider '{getattr(provider, 'model', 'unknown')}' is not available",
            True,
        )

    max_retries = CourtConfig.MAX_RETRIES if allow_retries else 0
    last_error = None
    last_category = "court_error"

    for attempt in range(max_retries + 1):
        try:
            response = provider.generate(
                prompt=f"Amendment text: {text}",
                system_prompt=system_prompt,
                json_schema=RULE_JSON_SCHEMA,
            )

            # Extract JSON
            json_str = extract_json(response)
            if not json_str:
                last_error = "Could not extract JSON from response"
                last_category = "invalid_rule"
                continue

            rule = parse_json_safely(json_str)
            if rule is None or not isinstance(rule, dict):
                last_error = "Invalid JSON format"
                last_category = "invalid_rule"
                continue

            if rule.get("not_a_game_rule") is True:
                return (
                    False,
                    None,
                    "not_a_game_rule",
                    "This is not a game rule. Please propose a rule that changes the gameplay.",
                    False,
                )

            amount_error = _requested_amount_error(text, rule)
            if amount_error:
                last_error = f"Invalid rule: {amount_error}"
                last_category = "invalid_rule"
                continue

            if "source" not in rule:
                rule["source"] = text

            if isinstance(rule.get("effect"), dict) and rule["effect"].get("type") == "set_win_target":
                if rule["effect"].get("target") in (None, "", "ignored") or rule["effect"].get("target") not in VALID_TARGETS:
                    rule["effect"]["target"] = "self"

            if validate_rule_fn:
                valid, error_msg = validate_rule_fn(rule)
                if not valid:
                    last_error = f"Invalid rule: {error_msg}"
                    last_category = "invalid_rule"
                    continue

            # Accepted and successfully validated
            return True, rule, "accepted", None, False

        except (ProviderAuthError, ProviderPermissionError, ProviderInvalidRequestError) as e:
            # Actionable non-fallback errors (Requirement 7)
            return False, None, "court_error", str(e), False

        except ProviderRateLimitError as e:
            # Rate limit reached: do NOT loop or retry on this provider; eligible for fallback immediately (Req 5, 8, 9)
            return False, None, "court_error", str(e), True

        except ProviderTimeoutError as e:
            # Transient timeout: retry if attempts remain, otherwise eligible for fallback (Req 6)
            last_error = f"The Court AI provider timed out: {e}. Match state remains unchanged."
            last_category = "court_error"
            continue

        except (ProviderConnectionError, ProviderServerError) as e:
            # Transient network/server error: retry if attempts remain, otherwise fallback (Req 6)
            last_error = str(e)
            last_category = "court_error"
            continue

        except ProviderModelNotFoundError as e:
            return False, None, "court_error", str(e), True

        except ProviderError as e:
            msg = str(e)
            if "429" in msg or "rate limit" in msg.lower():
                return False, None, "court_error", msg, True
            if "401" in msg or "authentication" in msg.lower() or "api key" in msg.lower():
                return False, None, "court_error", msg, False
            if "403" in msg or "permission" in msg.lower():
                return False, None, "court_error", msg, False
            last_error = f"Court provider error: {msg}"
            last_category = "court_error"
            continue

        except Exception as e:
            last_error = f"Unexpected error: {e}"
            last_category = "court_error"
            continue

    # Exhausted retries on this provider
    final_err = last_error or "Generation failed"
    if "Court provider error:" not in final_err and "timed out" not in final_err and "Invalid rule:" not in final_err:
        final_err = f"Failed to compile after {max_retries + 1} attempts. Last error: {final_err}"
    return False, None, last_category, final_err, True


def compile_amendment(
    text: str,
    state: Dict[str, Any],
    validate_rule_fn: Optional[Callable[[Dict[str, Any]], tuple[bool, Optional[str]]]] = None,
    cache: Optional[RuleCache] = None,
    provider: Optional[LLMProvider] = None,
    fallback_provider: Optional[LLMProvider] = None,
) -> Dict[str, Any]:
    """
    Compile a natural language amendment into a validated rule.
    Follows priority:
    1. Check persistent SQLite rule cache before external calls.
    2. Try primary provider first (e.g. Gemini).
    3. On confirmed HTTP 429 rate limit or transient failure, fall back to secondary (e.g. Groq).
    4. Do not fall back on invalid credentials, permission errors, or malformed requests.
    5. Single-flight request coalescing prevents duplicate concurrent identical calls.
    6. Persist only successfully validated rules to cache.

    Args:
        text: Player's amendment text
        state: Current game state
        validate_rule_fn: Optional validation function
        cache: Optional RuleCache instance (for test isolation)
        provider: Optional primary LLMProvider (for test isolation)
        fallback_provider: Optional fallback LLMProvider (for test isolation)

    Returns:
        Court response dict
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

    active_cache = cache if cache is not None else rule_cache

    # 1. Look for exact, safely normalized match in persistent rule cache BEFORE calling LLMs
    cache_key, normalized_text, context = compute_cache_key(trimmed, state)
    cached_rule = active_cache.get(cache_key)

    if cached_rule is not None:
        amount_err = _requested_amount_error(trimmed, cached_rule)
        engine_ok = True
        engine_err = None
        if validate_rule_fn:
            engine_ok, engine_err = validate_rule_fn(cached_rule)

        if not amount_err and engine_ok:
            cached_result = dict(cached_rule)
            cached_result["source"] = trimmed
            return {
                "accepted": True,
                "category": "accepted",
                "rule": cached_result,
                "error": None,
                "cached": True,
            }
        else:
            # Invalidate stale / invalid cached entry and fall through to LLM
            active_cache.invalidate(cache_key)

    # 2. Prevent concurrent identical requests from causing unnecessary duplicate provider calls
    is_leader, event = _single_flight.acquire(cache_key)
    if not is_leader:
        # Wait for the in-flight leader request to complete
        timeout_wait = float(CourtConfig.GEMINI_TIMEOUT + CourtConfig.GROQ_TIMEOUT + 5)
        event.wait(timeout=timeout_wait)
        # Check cache again
        cached_after = active_cache.get(cache_key)
        if cached_after is not None:
            amount_err = _requested_amount_error(trimmed, cached_after)
            engine_ok = True
            if validate_rule_fn:
                engine_ok, _ = validate_rule_fn(cached_after)
            if not amount_err and engine_ok:
                cached_res = dict(cached_after)
                cached_res["source"] = trimmed
                return {
                    "accepted": True,
                    "category": "accepted",
                    "rule": cached_res,
                    "error": None,
                    "cached": True,
                }

    try:
        # Build system prompt with game context
        system_prompt = build_system_prompt(state)

        # Resolve primary and fallback providers
        try:
            primary = provider if provider is not None else get_provider(CourtConfig.PRIMARY_PROVIDER)
        except Exception as e:
            return {
                "accepted": False,
                "category": "court_error",
                "rule": None,
                "error": f"Provider initialization failed: {e}",
            }

        try:
            secondary = fallback_provider if fallback_provider is not None else get_fallback_provider()
        except Exception:
            secondary = None

        # 3. Try primary provider first
        ok, rule, cat, err, fallback_eligible = _compile_with_provider(
            primary, trimmed, system_prompt, validate_rule_fn, allow_retries=True
        )

        if ok and rule is not None:
            active_cache.set(cache_key, normalized_text, context, rule)
            return {
                "accepted": True,
                "category": "accepted",
                "rule": rule,
                "error": None,
                "cached": False,
                "provider": getattr(primary, "model", CourtConfig.PRIMARY_PROVIDER),
            }

        if not fallback_eligible or secondary is None:
            return {
                "accepted": False,
                "category": cat,
                "rule": None,
                "error": err,
            }

        # 4. Attempt fallback provider on 429 rate limit or transient provider failure
        fb_ok, fb_rule, fb_cat, fb_err, _ = _compile_with_provider(
            secondary, trimmed, system_prompt, validate_rule_fn, allow_retries=False
        )

        if fb_ok and fb_rule is not None:
            active_cache.set(cache_key, normalized_text, context, fb_rule)
            return {
                "accepted": True,
                "category": "accepted",
                "rule": fb_rule,
                "error": None,
                "cached": False,
                "fallback_used": True,
                "provider": getattr(secondary, "model", getattr(CourtConfig, "FALLBACK_PROVIDER", "groq")),
            }

        primary_name = getattr(primary, "model", CourtConfig.PRIMARY_PROVIDER)
        secondary_name = getattr(secondary, "model", getattr(CourtConfig, "FALLBACK_PROVIDER", "groq"))
        return {
            "accepted": False,
            "category": fb_cat or "court_error",
            "rule": None,
            "error": f"Court provider error: Primary provider ({primary_name}) failed: {err}. Fallback provider ({secondary_name}) failed: {fb_err}",
        }

    finally:
        _single_flight.release(cache_key)
