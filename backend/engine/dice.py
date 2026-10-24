"""Dice rolling with injectable RNG for deterministic tests."""

import random


def roll_dice(dice_type: str, rng: random.Random) -> int:
    """Roll dice and return the total.

    dice_type: "1d6", "2d6", or "1d12"
    rng: a random.Random instance (injectable for deterministic tests)
    """
    if dice_type == "1d6":
        return rng.randint(1, 6)
    elif dice_type == "2d6":
        return rng.randint(1, 6) + rng.randint(1, 6)
    elif dice_type == "1d12":
        return rng.randint(1, 12)
    else:
        raise ValueError(f"Unknown dice_type: {dice_type!r}")
