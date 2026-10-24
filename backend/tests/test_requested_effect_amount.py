from backend.court.compiler import (
    _requested_effect_amount,
    _requested_amount_error,
)


def test_large_requested_points_detected():
    text = "Give me 1000 points"
    rule = {"effect": {"type": "add_score", "amount": 5, "target": "self"}}

    assert _requested_effect_amount(text) == (1000, "effect")
    assert _requested_amount_error(text, rule) == (
        "Effect amount 1000 exceeds ±5 cap"
    )


def test_valid_effect_amount():
    text = "Give me 3 points whenever I roll"
    rule = {"effect": {"type": "add_score", "amount": 3, "target": "self"}}

    assert _requested_amount_error(text, rule) is None


def test_condition_number_is_not_effect_amount():
    text = "If my score is above 10, give me 2 points"
    rule = {"effect": {"type": "add_score", "amount": 2, "target": "self"}}

    assert _requested_effect_amount(text) == (2, "effect")
    assert _requested_amount_error(text, rule) is None


def test_silently_changed_amount_is_rejected():
    text = "Give me 2 points"
    rule = {"effect": {"type": "add_score", "amount": 5, "target": "self"}}

    assert _requested_amount_error(text, rule) == (
        "Court changed the requested effect amount (requested 2, generated 5)"
    )


def test_win_target_above_limit_is_rejected():
    text = "Set win target to 70"
    rule = {
        "effect": {
            "type": "set_win_target",
            "amount": 50,
            "target": "self",
        }
    }

    assert _requested_effect_amount(text) == (70, "win_target")
    assert _requested_amount_error(text, rule) == (
        "set_win_target 70 outside 21..64"
    )


def test_move_amount_is_detected():
    text = "Move forward 100 spaces"
    rule = {"effect": {"type": "move", "amount": 5, "target": "self"}}

    assert _requested_effect_amount(text) == (100, "effect")
    assert _requested_amount_error(text, rule) == (
        "Effect amount 100 exceeds ±5 cap"
    )
