"""
Natural language amendment compiler.

Transforms player-written English text into validated rule JSON using an LLM.
"""

import json
import re
from typing import Dict, Any, Optional, Callable

from backend.court.providers import get_provider, ProviderError, ProviderTimeoutError
from backend.court.config import CourtConfig


# Court prompt template
SYSTEM_PROMPT = """You are the Court in AMENDMENT, a board game where players propose rule changes in plain English.

Your role: Convert the player's amendment text into exactly ONE rule object matching this JSON schema.

# RULE SCHEMA

A rule has:
- trigger: when it fires (on_turn_start, on_roll, on_land, win_check)
- condition: when it applies (mode: all|any, predicates: array)
- effect: what it does (type, amount, target)
- source: the original text

# VALID ENUMS

Triggers: on_turn_start, on_roll, on_land, win_check

Predicates:
- is_leader (no args)
- is_last (no args)
- roll_is_even (no args, not valid for on_turn_start)
- tile_is_prime (no args)
- score_gt (requires args: {{"value": int}})

Effect types:
- add_score (amount ±5, target)
- steal_score (amount abs(±5), target != self)
- move (amount ±5, target)
- skip_turn (amount 0, target)
- reroll (amount 0, target self)
- set_win_target (amount 5-30, target ignored)

Targets: self, leader, last, all_others

# CURRENT GAME STATE

Board size: {board_size} tiles (total: {total_tiles})
Dice type: {dice_type}
Win target: {win_target}
Current rules: {rule_count} (max: {max_rules})

# RULES

1. Output ONLY valid JSON matching the schema
2. Never invent triggers, predicates, or effects outside the enums
3. Clamp amounts: ±5 for most effects, 5-30 for set_win_target
4. score_gt MUST have args.value
5. Reject rules naming specific players (like "when Alice lands")
6. Reject meta-rules ("all rules are void", "I win")
7. Reject rules referencing tiles > {total_tiles}
8. Keep ruling to one short sentence with a dry tone

# OUTPUT FORMAT

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
        max_rules=max_rules
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


def compile_amendment(
    text: str,
    state: Dict[str, Any],
    validate_rule_fn: Optional[Callable[[Dict[str, Any]], tuple[bool, Optional[str]]]] = None
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
    """
    # Build system prompt with game context
    system_prompt = build_system_prompt(state)
    
    # Get the provider
    try:
        provider = get_provider()
    except Exception as e:
        return {
            "accepted": False,
            "rule": None,
            "error": f"Provider initialization failed: {e}"
        }
    
    # Check provider availability
    if not provider.is_available():
        return {
            "accepted": False,
            "rule": None,
            "error": "Court AI provider is not available"
        }
    
    # Attempt generation with retries
    max_retries = CourtConfig.MAX_RETRIES
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            # Generate response
            response = provider.generate(
                prompt=f"Amendment text: {text}",
                system_prompt=system_prompt
            )
            
            # Extract JSON
            json_str = extract_json(response)
            if not json_str:
                last_error = "Could not extract JSON from response"
                continue
            
            # Parse JSON
            rule = parse_json_safely(json_str)
            if not rule:
                last_error = "Invalid JSON format"
                continue
            
            # Validate required fields exist
            if not isinstance(rule, dict):
                last_error = "Response is not a JSON object"
                continue
            
            # Add source if missing
            if "source" not in rule:
                rule["source"] = text
            
            # Validate the rule structure using engine validator if provided
            if validate_rule_fn:
                valid, error_msg = validate_rule_fn(rule)
                if not valid:
                    return {
                        "accepted": False,
                        "rule": None,
                        "error": error_msg
                    }
            
            # Success!
            return {
                "accepted": True,
                "rule": rule,
                "error": None
            }
            
        except ProviderTimeoutError as e:
            return {
                "accepted": False,
                "rule": None,
                "error": f"Court request timed out: {e}"
            }
        except ProviderError as e:
            return {
                "accepted": False,
                "rule": None,
                "error": f"Court provider error: {e}"
            }
        except Exception as e:
            last_error = f"Unexpected error: {e}"
            continue
    
    # All retries exhausted
    return {
        "accepted": False,
        "rule": None,
        "error": f"Failed to compile after {max_retries + 1} attempts. Last error: {last_error}"
    }
