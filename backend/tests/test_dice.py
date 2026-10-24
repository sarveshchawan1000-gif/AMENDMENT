"""Tests for dice.py — injectable RNG dice rolling."""

import random

import pytest
from engine.dice import roll_dice


class TestRollDiceDeterministic:
    """Same seed → same results."""

    def test_same_seed_same_result_1d6(self):
        r1 = random.Random(99)
        r2 = random.Random(99)
        assert roll_dice("1d6", r1) == roll_dice("1d6", r2)

    def test_same_seed_same_result_2d6(self):
        r1 = random.Random(7)
        r2 = random.Random(7)
        assert roll_dice("2d6", r1) == roll_dice("2d6", r2)

    def test_same_seed_same_result_1d12(self):
        r1 = random.Random(123)
        r2 = random.Random(123)
        assert roll_dice("1d12", r1) == roll_dice("1d12", r2)


class TestRollDiceRange:
    """Dice values stay within valid bounds."""

    def test_1d6_range(self):
        rng = random.Random(42)
        for _ in range(1000):
            v = roll_dice("1d6", rng)
            assert 1 <= v <= 6

    def test_2d6_range(self):
        rng = random.Random(42)
        for _ in range(1000):
            v = roll_dice("2d6", rng)
            assert 2 <= v <= 12

    def test_1d12_range(self):
        rng = random.Random(42)
        for _ in range(1000):
            v = roll_dice("1d12", rng)
            assert 1 <= v <= 12


class TestRollDiceErrors:
    def test_unknown_dice_type_raises(self):
        with pytest.raises(ValueError, match="Unknown dice_type"):
            roll_dice("3d20", random.Random(42))
