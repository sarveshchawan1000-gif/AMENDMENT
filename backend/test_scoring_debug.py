"""Quick test to verify scoring works correctly."""

import random
from backend.engine.state import create_game
from backend.engine.engine import execute_turn


def test_no_base_scoring():
    """Test that turns complete without R2, scores stay at 0 until rules are added."""
    settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 25,
        "mode": "draft",
        "max_rules": 8
    }
    
    players = [
        {"id": "P1", "name": "Alice"},
        {"id": "P2", "name": "Bob"}
    ]
    
    state = create_game(settings, players, None)
    
    # Transition to playing phase
    state["phase"] = "playing"
    
    # Check initial state
    print(f"Initial rules count: {len(state['rules'])}")
    print(f"Initial P1 score: {state['players'][0]['score']}")
    print(f"Initial P2 score: {state['players'][1]['score']}")
    
    # Execute P1's turn with deterministic RNG
    rng = random.Random(42)
    execute_turn(state, rng)
    
    # Check scores after turn
    print(f"After turn P1 score: {state['players'][0]['score']}")
    print(f"After turn P2 score: {state['players'][1]['score']}")
    print(f"Current player: {state['current_player']}")
    print(f"Last roll: {state['last_roll']}")
    print(f"P1 position: {state['players'][0]['position']}")
    
    # Under Option A, points equal the dice roll (no +1 landing point)
    assert state['players'][0]['score'] == state['last_roll'], f"Expected P1 score to be {state['last_roll']}, got {state['players'][0]['score']}"
    # But position should have changed
    assert state['players'][0]['position'] > 1, f"Expected P1 position > 1, got {state['players'][0]['position']}"
    print("✅ Backend scoring works - movement works, dice points added!")


if __name__ == "__main__":
    test_no_base_scoring()
