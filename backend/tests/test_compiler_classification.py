import json
from unittest.mock import Mock, patch

from backend.court.compiler import compile_amendment


def make_state():
    return {
        "settings": {
            "board_size": 10,
            "win_target": 20,
            "max_rules": 12,
            "mode": "live",
        },
        "players": [
            {"id": "P1", "name": "Alice", "position": 0, "score": 0},
            {"id": "P2", "name": "Bob", "position": 1, "score": 0},
        ],
        "rules": [],
    }


def make_provider(response):
    provider = Mock()
    provider.is_available.return_value = True
    provider.generate.return_value = json.dumps(response)
    return provider


def valid_add_score_rule(amount=2):
    return {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {
            "type": "add_score",
            "amount": amount,
            "target": "self",
        },
    }


def test_non_game_rule_is_classified_correctly():
    provider = make_provider({
        "not_a_game_rule": True,
        "reason": "Not a gameplay rule",
    })

    with patch("backend.court.compiler.get_provider", return_value=provider):
        result = compile_amendment("fuck you", make_state())

    assert result["accepted"] is False
    assert result["category"] == "not_a_game_rule"
    assert result["rule"] is None


def test_excessive_requested_amount_is_rejected():
    # Simulate an AI that incorrectly clamps 1000 points to 5.
    provider = make_provider(valid_add_score_rule(amount=5))

    with patch("backend.court.compiler.get_provider", return_value=provider):
        result = compile_amendment("Give me 1000 points", make_state())

    assert result["accepted"] is False
    assert result["category"] == "invalid_rule"
    assert "1000" in result["error"]
    assert "±5 cap" in result["error"]


def test_condition_number_does_not_replace_effect_amount():
    provider = make_provider(valid_add_score_rule(amount=2))

    with patch("backend.court.compiler.get_provider", return_value=provider):
        result = compile_amendment(
            "If my score is above 10, give me 2 points",
            make_state(),
        )

    assert result["accepted"] is True
    assert result["category"] == "accepted"
    assert result["rule"]["effect"]["amount"] == 2


def test_changed_amount_is_rejected():
    provider = make_provider(valid_add_score_rule(amount=5))

    with patch("backend.court.compiler.get_provider", return_value=provider):
        result = compile_amendment("Give me 2 points", make_state())

    assert result["accepted"] is False
    assert result["category"] == "invalid_rule"
    assert "requested 2, generated 5" in result["error"]
