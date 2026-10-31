import random
import pytest
from backend.engine.state import create_game, add_amendment, rank_players
from backend.engine.engine import execute_turn
from backend.app import load_rulebooks

RULEBOOKS = load_rulebooks()

@pytest.mark.parametrize("seed", list(range(1, 31)))
def test_adversarial_simulation_run(seed):
    """Run an adversarial simulation across different configurations with invariant checks."""
    rng = random.Random(seed)
    
    # Random configuration
    board_size = rng.choice([6, 8, 10])
    dice_type = rng.choice(["1d6", "2d6", "1d12"])
    win_target = rng.randint(21, 35)
    mode = rng.choice(["hybrid", "live"])
    max_rules = rng.choice([8, 12, 16])
    num_players = rng.randint(2, 4)
    
    players = [{"id": f"P{i+1}", "name": f"Player {i+1}"} for i in range(num_players)]
    
    settings = {
        "board_size": board_size,
        "dice_type": dice_type,
        "win_target": win_target,
        "mode": mode,
        "max_rules": max_rules,
        "amend_every": rng.choice([1, 2]),
    }
    
    # Pick compatible rulebook if hybrid
    rulebook = None
    if mode == "hybrid":
        compat = [rb for rb in RULEBOOKS if not rb.get("board_sizes") or board_size in rb["board_sizes"]]
        rulebook = rng.choice(compat) if compat else RULEBOOKS[0]
        settings["rulebook_name"] = rulebook["name"]

    state = create_game(settings, players, rulebook)
    
    total_tiles = board_size * board_size
    turns_executed = 0
    max_turns = 80
    
    while state["phase"] != "finished" and turns_executed < max_turns:
        turns_executed += 1
        
        # In live mode, randomly inject an amendment if moves_since_amend >= amend_every
        if mode == "live" and state["moves_since_amend"] >= settings["amend_every"] and len(state["rules"]) < max_rules:
            # Craft random legal rule
            rule = {
                "trigger": rng.choice(["on_roll", "on_land", "on_turn_start"]),
                "condition": {
                    "mode": "all",
                    "predicates": rng.choice([
                        [],
                        [{"name": "roll_is_even"}],
                        [{"name": "tile_is_prime"}],
                        [{"name": "is_leader"}],
                        [{"name": "is_last"}],
                        [{"name": "score_gt", "args": {"value": rng.randint(5, 20)}}],
                    ])
                },
                "effect": {
                    "type": rng.choice(["add_score", "steal_score", "move", "skip_turn"]),
                    "amount": rng.randint(1, 4),
                    "target": rng.choice(["self", "leader", "last", "all_others"]),
                },
                "source": f"Simulated rule turn {turns_executed}"
            }
            # Add rule
            add_amendment(state, rule)
            state["moves_since_amend"] = 0
            
        execute_turn(state, rng)
        
        # INVARIANT 1: Player positions must be strictly within [1, total_tiles]
        for p in state["players"]:
            assert 1 <= p["position"] <= total_tiles, f"Position {p['position']} out of bounds [1, {total_tiles}]"
            
        # INVARIANT 2: Player scores must be non-negative
        for p in state["players"]:
            assert p["score"] >= 0, f"Player {p['id']} score {p['score']} < 0"
            
        # INVARIANT 3: Leaderboard rank 1 must match highest score
        ranks = rank_players(state["players"])
        max_score = max(p["score"] for p in state["players"])
        for i, p in enumerate(state["players"]):
            if p["score"] == max_score:
                assert ranks[i] == 1, f"Player {p['id']} with max score {max_score} has rank {ranks[i]} != 1"
            else:
                assert ranks[i] > 1, f"Player {p['id']} with score {p['score']} < {max_score} has rank 1"
                
    if state["phase"] == "finished":
        # INVARIANT 4: Winner must have reached or exceeded win_target
        assert state["winner"] is not None
        winner = [p for p in state["players"] if p["id"] == state["winner"]][0]
        assert winner["score"] >= state["settings"]["win_target"]
        
        # INVARIANT 5: Winner must have the highest score among contenders
        max_score = max(p["score"] for p in state["players"])
        assert winner["score"] == max_score, f"Winner {winner['id']} has score {winner['score']} but max score is {max_score}"
        
        # INVARIANT 6: Further execution on finished game does not mutate state
        scores_before = [p["score"] for p in state["players"]]
        pos_before = [p["position"] for p in state["players"]]
        turn_before = state["turn"]
        execute_turn(state, rng)
        assert [p["score"] for p in state["players"]] == scores_before
        assert [p["position"] for p in state["players"]] == pos_before
        assert state["turn"] == turn_before
