"""
Integration tests for compiler with real engine validator.

These tests verify that the compiler output is compatible with the engine.
Still uses mocked providers - no Ollama required.
"""

import pytest
from unittest.mock import Mock, patch
from backend.court.compiler import compile_amendment
from backend.engine.validate import validate_rule


@pytest.fixture
def mock_state():
    """Sample game state."""
    return {
        "settings": {
            "board_size": 8,
            "dice_type": "2d6",
            "win_target": 15,
            "max_rules": 12
        },
        "rules": [{"id": "R2"}],
        "players": []
    }


@patch('backend.court.compiler.get_provider')
def test_integration_valid_rule_passes_engine_validation(mock_get_provider, mock_state):
    """A valid rule should pass engine validation."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 2, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "When you land, gain 2 points",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is True
    assert result["rule"] is not None
    
    # Double-check with engine validator
    valid, error = validate_rule(result["rule"])
    assert valid is True
    assert error is None


@patch('backend.court.compiler.get_provider')
def test_integration_invalid_trigger_rejected(mock_get_provider, mock_state):
    """Invalid trigger should be rejected by engine validator."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_death",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 1, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "When you die, gain points",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "Invalid trigger" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_amount_exceeds_cap(mock_get_provider, mock_state):
    """Amount exceeding cap should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 10, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Gain 10 points",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "exceeds" in result["error"]
    assert "5" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_score_gt_missing_args(mock_get_provider, mock_state):
    """score_gt without args.value should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {
    "mode": "all",
    "predicates": [{"name": "score_gt"}]
  },
  "effect": {"type": "add_score", "amount": 2, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "If score high, gain points",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "score_gt" in result["error"]
    assert "args.value" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_invalid_effect_type(mock_get_provider, mock_state):
    """Invalid effect type should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "explode", "amount": 1, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Explode",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "Invalid effect.type" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_invalid_target(mock_get_provider, mock_state):
    """Invalid target should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "add_score", "amount": 1, "target": "everyone"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Give everyone points",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "Invalid effect.target" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_complex_valid_rule(mock_get_provider, mock_state):
    """Complex rule with multiple predicates should work."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {
    "mode": "all",
    "predicates": [
      {"name": "is_last"},
      {"name": "roll_is_even"},
      {"name": "score_gt", "args": {"value": 5}}
    ]
  },
  "effect": {"type": "steal_score", "amount": 3, "target": "leader"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "If last place, even roll, and score > 5, steal 3 from leader",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is True
    assert result["rule"]["condition"]["mode"] == "all"
    assert len(result["rule"]["condition"]["predicates"]) == 3
    
    # Verify passes engine validation
    valid, error = validate_rule(result["rule"])
    assert valid is True


@patch('backend.court.compiler.get_provider')
def test_integration_set_win_target_valid(mock_get_provider, mock_state):
    """set_win_target within 5-30 range should pass."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "win_check",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "set_win_target", "amount": 30, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Set win target to 30",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is True
    
    valid, error = validate_rule(result["rule"])
    assert valid is True


@patch('backend.court.compiler.get_provider')
def test_integration_set_win_target_at_new_maximum(mock_get_provider, mock_state):
    """set_win_target of 50 should be accepted."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "win_check",
  "condition": {"mode": "all", "predicates": []},
  "effect": {"type": "set_win_target", "amount": 50, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Set win target to 50",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is True
    assert result["rule"]["effect"]["amount"] == 50


@patch('backend.court.compiler.get_provider')
def test_integration_missing_effect(mock_get_provider, mock_state):
    """Missing effect should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {"mode": "all", "predicates": []}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "Something happens",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "Missing 'effect'" in result["error"]


@patch('backend.court.compiler.get_provider')
def test_integration_invalid_predicate_name(mock_get_provider, mock_state):
    """Invalid predicate name should be rejected."""
    mock_provider = Mock()
    mock_provider.is_available.return_value = True
    mock_provider.generate.return_value = '''{
  "trigger": "on_land",
  "condition": {
    "mode": "all",
    "predicates": [{"name": "is_winning"}]
  },
  "effect": {"type": "add_score", "amount": 1, "target": "self"}
}'''
    mock_get_provider.return_value = mock_provider
    
    result = compile_amendment(
        "If winning, gain a point",
        mock_state,
        validate_rule
    )
    
    assert result["accepted"] is False
    assert "Invalid predicate" in result["error"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
