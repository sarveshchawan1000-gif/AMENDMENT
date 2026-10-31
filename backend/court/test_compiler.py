"""
Unit tests for the amendment compiler.

Uses mocked providers - no Ollama or internet connection required.
"""

import pytest
from unittest.mock import Mock, patch
from backend.court.compiler import (
    compile_amendment,
    extract_json,
    parse_json_safely,
    build_system_prompt
)


# --- Test fixtures ---

@pytest.fixture(autouse=True)
def clear_cache_between_tests():
    from backend.court.cache import rule_cache
    rule_cache.clear()
    yield
    rule_cache.clear()


@pytest.fixture
def mock_state():
    """Sample game state for testing."""
    return {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 10,
            "max_rules": 8
        },
        "rules": [
            {"id": "R2", "trigger": "on_land", "immutable": True}
        ],
        "players": [
            {"id": "P1", "name": "Alice", "score": 5, "position": 3}
        ]
    }


@pytest.fixture
def mock_validate_rule():
    """Mock validation function that always passes."""
    def validate(rule):
        # Check basic required fields
        if "trigger" not in rule:
            return False, "Missing 'trigger'"
        if "condition" not in rule:
            return False, "Missing 'condition'"
        if "effect" not in rule:
            return False, "Missing 'effect'"
        return True, None
    return validate


# --- Extract JSON tests ---

def test_extract_json_from_fenced_block():
    """Should extract JSON from markdown code fence."""
    text = '```json\n{"trigger": "on_land"}\n```'
    result = extract_json(text)
    assert result == '{"trigger": "on_land"}'


def test_extract_json_from_plain_fence():
    """Should extract JSON from plain code fence."""
    text = '```\n{"trigger": "on_roll"}\n```'
    result = extract_json(text)
    assert result == '{"trigger": "on_roll"}'


def test_extract_json_from_raw():
    """Should extract JSON without code fences."""
    text = 'Here is the rule: {"trigger": "on_land"}'
    result = extract_json(text)
    assert result == '{"trigger": "on_land"}'


def test_extract_json_none_when_missing():
    """Should return None when no JSON found."""
    text = "This has no JSON"
    result = extract_json(text)
    assert result is None


def test_extract_json_multiline():
    """Should extract multiline JSON."""
    text = '''```json
{
  "trigger": "on_land",
  "condition": {"mode": "all"}
}
```'''
    result = extract_json(text)
    assert '"trigger"' in result
    assert '"on_land"' in result


# --- Parse JSON tests ---

def test_parse_json_safely_valid():
    """Should parse valid JSON."""
    result = parse_json_safely('{"trigger": "on_land"}')
    assert result == {"trigger": "on_land"}


def test_parse_json_safely_invalid():
    """Should return None for invalid JSON."""
    result = parse_json_safely('not json')
    assert result is None


def test_parse_json_safely_malformed():
    """Should return None for malformed JSON."""
    result = parse_json_safely('{"trigger": }')
    assert result is None


def test_parse_json_safely_no_eval():
    """Should not execute code (no eval)."""
    # This would be dangerous with eval()
    result = parse_json_safely('{"trigger": "__import__(\\"os\\").system(\\"ls\\")"}')
    # Should parse as string, not execute
    assert result is not None
    assert result["trigger"] == '__import__("os").system("ls")'


# --- Build system prompt tests ---

def test_build_system_prompt_includes_context(mock_state):
    """Should include game state in prompt."""
    prompt = build_system_prompt(mock_state)
    assert "Board size: 6" in prompt
    assert "total: 36" in prompt
    assert "Dice type: 1d6" in prompt
    assert "Win target: 10" in prompt
    assert "Current rules: 1" in prompt
    assert "max: 8" in prompt


def test_build_system_prompt_includes_enums(mock_state):
    """Should include valid enums."""
    prompt = build_system_prompt(mock_state)
    assert "on_turn_start" in prompt
    assert "on_roll" in prompt
    assert "on_land" in prompt
    assert "win_check" in prompt
    assert "is_leader" in prompt
    assert "score_gt" in prompt
    assert "add_score" in prompt
    assert "steal_score" in prompt


# --- Compile amendment tests ---

@patch('backend.court.compiler.get_provider')
def test_compile_simple_rule(mock_get_provider, mock_state, mock_validate_rule):
    """Should compile a simple amendment."""
    # Mock provider
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''```json
{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 2, "target": "self"}
}
```'''
    mock_get_provider.return_value = mock_provider
    
    # Compile
    result = compile_amendment(
        "When you land, gain 2 points",
        mock_state,
        mock_validate_rule
    )
    
    # Verify
    assert result["accepted"] is True
    assert result["rule"] is not None
    assert result["error"] is None
    assert result["rule"]["trigger"] == "on_land"
    assert result["rule"]["effect"]["amount"] == 2


@patch('backend.court.compiler.get_provider')
def test_compile_adds_source(mock_get_provider, mock_state, mock_validate_rule):
    """Should add source field if missing."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '{"trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}}'
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test amendment",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is True
    assert result["rule"]["source"] == "Test amendment"


@patch('backend.court.compiler.get_provider')
def test_compile_malformed_json_retries(mock_get_provider, mock_state, mock_validate_rule):
    """Should retry on malformed JSON."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    # First attempt: bad JSON, second attempt: good JSON
    mock_provider.generate.side_effect = [
        '{"trigger": invalid}',
        '{"trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}}'
    ]
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    # Should succeed on second attempt
    assert result["accepted"] is True
    assert mock_provider.generate.call_count == 2


@patch('backend.court.compiler.get_provider')
def test_compile_no_json_retries(mock_get_provider, mock_state, mock_validate_rule):
    """Should retry when no JSON found."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.side_effect = [
        'Sorry, I cannot help with that.',
        '{"trigger": "on_land", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}}'
    ]
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is True
    assert mock_provider.generate.call_count == 2


@patch('backend.court.compiler.get_provider')
def test_compile_exhausts_retries(mock_get_provider, mock_state, mock_validate_rule):
    """Should fail after max retries."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = 'no json here'
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is False
    assert result["rule"] is None
    assert "Failed to compile" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_validation_failure(mock_get_provider, mock_state):
    """Should reject when validation fails."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '{"trigger": "invalid_trigger", "condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}}'
    mock_get_provider.return_value = mock_provider
    
    # Validation function that rejects
    def validate(rule):
        if rule["trigger"] == "invalid_trigger":
            return False, "Invalid trigger: 'invalid_trigger'"
        return True, None
    
    result = compile_amendment(
        "Test",
        mock_state,
        validate
    )
    
    assert result["accepted"] is False
    assert result["rule"] is None
    assert "Invalid trigger" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_provider_unavailable(mock_get_provider, mock_state, mock_validate_rule):
    """Should fail gracefully when provider unavailable."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = False
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is False
    assert "not available" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_provider_timeout(mock_get_provider, mock_state, mock_validate_rule):
    """Should handle provider timeout."""
    from backend.court.providers.base import ProviderTimeoutError
    
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.side_effect = ProviderTimeoutError("Timeout after 30s")
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is False
    assert "timed out" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_provider_error(mock_get_provider, mock_state, mock_validate_rule):
    """Should handle provider error."""
    from backend.court.providers.base import ProviderError
    
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.side_effect = ProviderError("Model not found")
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is False
    assert "provider error" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_missing_trigger(mock_get_provider, mock_state, mock_validate_rule):
    """Should reject rule missing required field."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '{"condition": {"mode": "all", "predicates": []}, "effect": {"type": "add_score", "amount": 1, "target": "self"}}'
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is False
    assert "Missing 'trigger'" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_compile_handles_fenced_json(mock_get_provider, mock_state, mock_validate_rule):
    """Should handle JSON in markdown code fences."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''Here is the rule:
```json
{
  "trigger": "on_roll",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 3, "target": "self"}
}
```
Hope that helps!'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Test",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is True
    assert result["rule"]["trigger"] == "on_roll"
    assert result["rule"]["effect"]["amount"] == 3


@patch('backend.court.compiler.get_provider')
def test_compile_preserves_score_gt_args(mock_get_provider, mock_state, mock_validate_rule):
    """Should preserve score_gt args.value."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {
    "mode": "all",
    "predicates": [{"name": "score_gt", "args": {"value": 10}}]
  },
  "effect": {"type": "add_score", "amount": 2, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "If score above 10, gain 2 points on landing",
        mock_state,
        mock_validate_rule
    )
    
    assert result["accepted"] is True
    predicates = result["rule"]["condition"]["predicates"]
    assert len(predicates) == 1
    assert predicates[0]["name"] == "score_gt"
    assert predicates[0]["args"]["value"] == 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
