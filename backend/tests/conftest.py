"""Shared fixtures and helpers for AMENDMENT engine tests."""

import os
import sys

# Make backend/ and tests/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))

import pytest


# --- Fixed RNG for deterministic dice ----------------------------------------

class FixedRNG:
    """RNG that returns pre-set values for deterministic tests.

    Usage: FixedRNG([3]) → randint always returns 3.
          FixedRNG([2, 4]) → first randint → 2, second → 4 (for 2d6).
    """

    def __init__(self, values=None):
        self.values = list(values or [3])
        self.idx = 0

    def randint(self, a, b):
        v = self.values[self.idx % len(self.values)]
        self.idx += 1
        return v

    def choice(self, seq):
        return seq[0]


# --- Fixtures -----------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_test_state():
    """Reset rate limiters and rule cache for clean test isolation."""
    try:
        from backend.auth import auth_rate_limiter
        auth_rate_limiter._requests.clear()
    except Exception:
        pass

    try:
        from backend.rooms import create_rate_limiter, join_rate_limiter
        create_rate_limiter._requests.clear()
        join_rate_limiter._requests.clear()
    except Exception:
        pass

    try:
        from backend.app import game_create_rate_limiter, court_compile_rate_limiter
        game_create_rate_limiter._requests.clear()
        court_compile_rate_limiter._requests.clear()
    except Exception:
        pass

    try:
        from backend.court.cache import rule_cache
        rule_cache.clear()
    except Exception:
        pass

    yield

    try:
        from backend.court.cache import rule_cache
        rule_cache.clear()
    except Exception:
        pass


@pytest.fixture
def rng():
    """Deterministic RNG seeded at 42."""
    import random
    return random.Random(42)


@pytest.fixture
def settings():
    """Default game settings."""
    return {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 10,
        "mode": "draft",
        "max_rules": 8,
        "amend_every": None,
    }


@pytest.fixture
def players():
    """Default 3-player roster."""
    return [
        {"id": "P1", "name": "Alice"},
        {"id": "P2", "name": "Bob"},
        {"id": "P3", "name": "Carol"},
    ]


@pytest.fixture
def game(settings, players):
    """A fresh game state in drafting phase."""
    from engine.state import create_game
    return create_game(settings, players)


# --- Helpers (importable from any test module) --------------------------------

def make_rule(trigger="on_land", effect_type="add_score", amount=1,
              target="self", predicates=None, mode="all",
              immutable=False, source="test"):
    """Create a minimal rule dict for testing."""
    return {
        "trigger": trigger,
        "condition": {
            "mode": mode,
            "predicates": predicates or [],
        },
        "effect": {
            "type": effect_type,
            "amount": amount,
            "target": target,
        },
        "immutable": immutable,
        "source": source,
    }


def make_pred(name, **args):
    """Create a predicate dict."""
    return {"name": name, "args": args} if args else {"name": name}


def make_game_with(scores=None, positions=None, rules=None,
                   board_size=6, dice_type="1d6", win_target=10,
                   mode="draft", max_rules=8, amend_every=None):
    """Create a game in 'playing' phase with optional custom state.

    scores:     list of ints to set each player's score.
    positions:  list of ints to set each player's position.
    rules:      list of rule dicts to add as amendments.
    """
    from engine.state import create_game, add_amendment

    settings = {
        "board_size": board_size,
        "dice_type": dice_type,
        "win_target": win_target,
        "mode": mode,
        "max_rules": max_rules,
        "amend_every": amend_every,
    }
    pl = [{"id": "P1", "name": "Alice"},
          {"id": "P2", "name": "Bob"}]
    state = create_game(settings, pl)
    state["phase"] = "playing"  # skip drafting

    if scores:
        for i, s in enumerate(scores):
            state["players"][i]["score"] = s
    if positions:
        for i, p in enumerate(positions):
            state["players"][i]["position"] = p
    if rules:
        for r in rules:
            add_amendment(state, r)
    return state


def run_turn(state, roll_values=None):
    """Execute a turn with a FixedRNG for deterministic dice.

    roll_values: list of ints the RNG will return in order.
    """
    from engine.engine import execute_turn
    rng = FixedRNG(roll_values or [3])
    return execute_turn(state, rng)
