"""
Unit tests for structured output (Task 3d) and generation options (Task 4a).
"""

from unittest.mock import patch, Mock
import pytest

from backend.court.providers.ollama import OllamaProvider
from backend.court.schema import RULE_JSON_SCHEMA
from backend.court.compiler import compile_amendment
from backend.engine.validate import validate_rule


def test_schema_and_options_passed_in_ollama_payload():
    """Verify json_schema is passed as 'format', options and keep_alive in payload."""
    provider = OllamaProvider(
        base_url="http://localhost:11434",
        model="gemma3:4b",
        seed=42,
        num_ctx=4096,
        keep_alive="30m",
        num_predict=512,
    )

    mock_resp = Mock()
    mock_resp.json.return_value = {"response": '{"trigger": "on_land"}'}
    mock_resp.raise_for_status = Mock()

    with patch("requests.post", return_value=mock_resp) as mock_post:
        provider.generate(
            prompt="Test prompt",
            system_prompt="Test system",
            json_schema=RULE_JSON_SCHEMA,
        )

        assert mock_post.called
        call_kwargs = mock_post.call_args[1]
        payload = call_kwargs["json"]

        assert payload["format"] == RULE_JSON_SCHEMA
        assert payload["keep_alive"] == "30m"
        assert payload["options"]["seed"] == 42
        assert payload["options"]["num_ctx"] == 4096
        assert payload["options"]["num_predict"] == 512


def test_over_limit_amount_rejected_not_clamped():
    """An over-limit amount ('give me 100 points') must be rejected with amount error, not clamped."""
    mock_provider = Mock()
    mock_provider.availability_detail.return_value = (True, True, "Ready")
    mock_provider.is_available.return_value = True

    # LLM outputs rule with amount=100
    mock_provider.generate.return_value = (
        '{"trigger": "on_land", '
        '"condition": {"mode": "all", "predicates": []}, '
        '"effect": {"type": "add_score", "amount": 100, "target": "self"}}'
    )

    state = {
        "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 21, "max_rules": 8},
        "rules": [],
        "players": [],
    }

    with patch("backend.court.compiler.get_provider", return_value=mock_provider):
        result = compile_amendment("Give me 100 points", state, validate_rule)

        assert result["accepted"] is False
        assert result["category"] == "invalid_rule"
        assert "cap" in result["error"].lower() or "5" in result["error"]
        assert result["rule"] is None
