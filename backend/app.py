"""
FastAPI backend for AMENDMENT board game.

Provides REST API for game creation, state retrieval, turn execution, and amendments.
"""

import os
import json
import sys
import random
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import jsonschema

# Engine imports
from backend.engine.state import create_game, add_amendment, select_rulebook
from backend.engine.engine import execute_turn
from backend.engine.validate import can_amend, validate_rule as engine_validate_rule

# Court imports
from backend.court.compiler import compile_amendment


# --- Configuration ---

app = FastAPI(
    title="AMENDMENT API",
    description="A board game where players rewrite the rules by typing plain English",
    version="1.0.0"
)

# CORS middleware for frontend integration
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory game storage (for hackathon MVP - replace with DB in production)
games: Dict[str, dict] = {}

# Injectable RNG factory for deterministic tests
_rng_factory = lambda: random.Random()


def set_rng_factory(factory):
    """Set RNG factory for deterministic tests."""
    global _rng_factory
    _rng_factory = factory


def get_rng():
    """Get a new RNG instance."""
    return _rng_factory()


# --- Request/Response Models ---

class PlayerInput(BaseModel):
    """Player information for game creation."""
    id: str = Field(..., description="Unique player ID (e.g., P1, P2)")
    name: str = Field(..., description="Player display name")


class GameSettings(BaseModel):
    """Game settings for game creation."""
    board_size: int = Field(..., description="Grid dimension: 6, 8, or 10")
    dice_type: str = Field(..., description="Dice configuration: 1d6, 2d6, or 1d12")
    win_target: int = Field(..., description="Score needed to win (1-64)")
    mode: str = Field(..., description="Game mode: draft, live, or hybrid")
    max_rules: int = Field(..., description="Maximum rules (8, 12, or 16)")
    amend_every: Optional[int] = Field(None, description="For live mode: amend every N moves (1 or 2)")


class CreateGameRequest(BaseModel):
    """Request body for POST /game/new."""
    settings: GameSettings
    players: List[PlayerInput]


class CreateGameResponse(BaseModel):
    """Response for POST /game/new."""
    game_id: str
    state: dict


class GetStateResponse(BaseModel):
    """Response for GET /game/{id}."""
    state: dict


class ExecuteTurnRequest(BaseModel):
    """Request body for POST /game/{id}/roll."""
    player_id: str


class ExecuteTurnResponse(BaseModel):
    """Response for POST /game/{id}/roll."""
    state: dict
    roll: int


class AmendRequest(BaseModel):
    """Request body for POST /game/{id}/amend."""
    player_id: str
    text: str = Field(..., description="Natural language amendment text")


class AmendResponse(BaseModel):
    """Response for POST /game/{id}/amend."""
    accepted: bool
    category: Optional[str] = None
    rule: Optional[dict]
    error: Optional[str]
    state: dict


# --- Helper Functions ---

def get_project_root() -> Path:
    """Get the project root directory (parent of backend/)."""
    # backend/app.py -> backend/ -> project root
    return Path(__file__).parent.parent


def load_rulebook_schema() -> dict:
    """Load and cache the rulebook JSON schema."""
    schema_path = get_project_root() / "schema" / "rulebook.schema.json"

    if not schema_path.exists():
        print(f"Warning: Rulebook schema not found at {schema_path}", file=sys.stderr)
        return {}

    try:
        with open(schema_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Warning: Failed to load rulebook schema: {e}", file=sys.stderr)
        return {}


def load_rulebooks(rulebooks_dir: Optional[Path] = None) -> List[dict]:
    """
    Load and validate all rulebooks from rulebooks/ directory.

    Args:
        rulebooks_dir: Optional directory path for testing. Defaults to project_root/rulebooks.

    Returns:
        List of valid rulebooks that passed schema and rule validation.
    """
    # Resolve rulebooks directory
    if rulebooks_dir is None:
        rulebooks_dir = get_project_root() / "rulebooks"

    if not rulebooks_dir.exists():
        return []

    # Load JSON schema
    schema = load_rulebook_schema()
    if not schema:
        print("Warning: No schema available, skipping schema validation", file=sys.stderr)

    rulebooks = []

    for filepath in sorted(rulebooks_dir.glob("*.json")):
        try:
            # Load JSON
            with open(filepath, "r") as f:
                try:
                    rulebook = json.load(f)
                except json.JSONDecodeError as e:
                    print(f"Skipping {filepath.name}: Malformed JSON - {e}", file=sys.stderr)
                    continue

            # Basic type check
            if not isinstance(rulebook, dict):
                print(f"Skipping {filepath.name}: Root is not a JSON object", file=sys.stderr)
                continue

            # Validate against JSON schema
            if schema:
                try:
                    jsonschema.validate(rulebook, schema)
                except jsonschema.ValidationError as e:
                    print(f"Skipping {filepath.name}: Schema validation failed - {e.message}", file=sys.stderr)
                    continue
                except jsonschema.SchemaError as e:
                    print(f"Skipping {filepath.name}: Schema error - {e}", file=sys.stderr)
                    continue

            # Validate required fields
            if "name" not in rulebook:
                print(f"Skipping {filepath.name}: Missing required field 'name'", file=sys.stderr)
                continue

            if "rules" not in rulebook:
                print(f"Skipping {filepath.name}: Missing required field 'rules'", file=sys.stderr)
                continue

            if not isinstance(rulebook["rules"], list):
                print(f"Skipping {filepath.name}: 'rules' must be an array", file=sys.stderr)
                continue

            # Validate board_sizes if present
            if "board_sizes" in rulebook:
                board_sizes = rulebook["board_sizes"]
                if not isinstance(board_sizes, list):
                    print(f"Skipping {filepath.name}: 'board_sizes' must be an array", file=sys.stderr)
                    continue

                # Check each board size is valid
                for size in board_sizes:
                    if size not in [6, 8, 10]:
                        print(f"Skipping {filepath.name}: Invalid board size {size} (must be 6, 8, or 10)", file=sys.stderr)
                        continue

            # Validate each rule using engine validator
            all_rules_valid = True
            for idx, rule in enumerate(rulebook["rules"]):
                valid, error = engine_validate_rule(rule)
                if not valid:
                    print(f"Skipping {filepath.name}: Rule {idx} invalid - {error}", file=sys.stderr)
                    all_rules_valid = False
                    break

            if not all_rules_valid:
                continue

            # All validations passed
            rulebooks.append(rulebook)

        except Exception as e:
            print(f"Skipping {filepath.name}: Unexpected error - {e}", file=sys.stderr)
            continue

    return rulebooks


# --- API Endpoints ---

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "name": "AMENDMENT API",
        "status": "running",
        "version": "1.0.0"
    }


@app.post("/game/new", response_model=CreateGameResponse, status_code=status.HTTP_201_CREATED)
async def create_new_game(request: CreateGameRequest):
    """
    Create a new game.

    For hybrid mode, selects a random rulebook compatible with the board size.
    """
    # Convert Pydantic models to dicts
    settings_dict = request.settings.model_dump()
    players_list = [p.model_dump() for p in request.players]

    # Validate settings
    if settings_dict["board_size"] not in [6, 8, 10]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="board_size must be 6, 8, or 10"
        )

    if settings_dict["dice_type"] not in ["1d6", "2d6", "1d12"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dice_type must be '1d6', '2d6', or '1d12'"
        )

    if not (1 <= settings_dict["win_target"] <= 64):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="win_target must be between 1 and 64"
        )

    if settings_dict["mode"] not in ["draft", "live", "hybrid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="mode must be 'draft', 'live', or 'hybrid'"
        )

    if settings_dict["max_rules"] not in [8, 12, 16]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_rules must be 8, 12, or 16"
        )

    if settings_dict["mode"] == "live" and settings_dict.get("amend_every") not in [1, 2]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="live mode requires amend_every to be 1 or 2"
        )

    if len(players_list) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 players required"
        )

    # Handle hybrid mode - select rulebook
    rulebook = None
    if settings_dict["mode"] == "hybrid":
        rulebooks = load_rulebooks()
        if not rulebooks:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No rulebooks available for hybrid mode"
            )

        try:
            rng = get_rng()
            rulebook = select_rulebook(rulebooks, settings_dict["board_size"], rng)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No compatible rulebook found: {e}"
            )

    # Create game state
    try:
        state = create_game(settings_dict, players_list, rulebook)
        game_id = state["game_id"]
        games[game_id] = state

        return CreateGameResponse(game_id=game_id, state=state)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create game: {e}"
        )


@app.get("/game/{game_id}", response_model=GetStateResponse)
async def get_game_state(game_id: str):
    """
    Get the current state of a game.
    """
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    return GetStateResponse(state=games[game_id])


@app.post("/game/{game_id}/roll", response_model=ExecuteTurnResponse)
async def execute_player_turn(game_id: str, request: ExecuteTurnRequest):
    """
    Execute the current player's turn.

    Validates that the specified player_id matches the current player.
    """
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    state = games[game_id]

    # Validate player_id matches current player
    current_player_idx = state["current_player"]
    current_player = state["players"][current_player_idx]

    if current_player["id"] != request.player_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not {request.player_id}'s turn. Current player is {current_player['id']}"
        )

    # Check if game is finished
    if state["phase"] == "finished":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Game is already finished"
        )

    # Execute turn with injectable RNG
    rng = get_rng()
    execute_turn(state, rng)

    roll = state["last_roll"]

    return ExecuteTurnResponse(state=state, roll=roll)


def _consume_live_amendment_opportunity(state: dict) -> None:
    """Close the current live-mode amendment opportunity."""
    if state["settings"]["mode"] == "live":
        state["moves_since_amend"] = 0


@app.post("/game/{game_id}/amend", response_model=AmendResponse)
async def submit_amendment(game_id: str, request: AmendRequest):
    """
    Submit a natural language amendment.

    Checks amendment eligibility, compiles the text using the Court,
    validates the rule, and adds it to the game state if accepted.
    """
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    state = games[game_id]

    # Validate player exists
    player_ids = [p["id"] for p in state["players"]]
    if request.player_id not in player_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player {request.player_id} not found in this game"
        )

    # Check whether an amendment opportunity currently exists.
    allowed, reason = can_amend(state)
    if not allowed:
        return AmendResponse(
            accepted=False,
            rule=None,
            error=reason,
            state=state
        )

    # Only the player who completed the qualifying turn may amend.
    if state["settings"]["mode"] == "live":
        if request.player_id != state.get("last_actor_id"):
            return AmendResponse(
                accepted=False,
                rule=None,
                error="Only the player who completed the qualifying turn may amend.",
                state=state,
            )

    # Compile amendment using the Court
    try:
        court_response = compile_amendment(request.text, state, engine_validate_rule)
    except Exception as e:
        _consume_live_amendment_opportunity(state)
        return AmendResponse(
            accepted=False,
            rule=None,
            error=f"Court compilation failed: {e}",
            state=state
        )

    # If Court rejected, return immediately
    if not court_response["accepted"]:
        _consume_live_amendment_opportunity(state)
        return AmendResponse(
            accepted=False,
            category=court_response.get("category"),
            rule=None,
            error=court_response["error"],
            state=state
        )

    # Add amendment to game state
    rule = court_response["rule"]
    success, error = add_amendment(state, rule)

    if not success:
        _consume_live_amendment_opportunity(state)
        return AmendResponse(
            accepted=False,
            rule=None,
            error=error,
            state=state
        )

    # Close the opportunity after successful insertion.
    _consume_live_amendment_opportunity(state)

    # Return the rule with id assigned by engine
    added_rule = state["rules"][-1]
    
    return AmendResponse(
        accepted=True,
        category="accepted",
        rule=added_rule,
        error=None,
        state=state
    )


@app.post("/game/{game_id}/pass-amendment")
async def pass_amendment(game_id: str, request: ExecuteTurnRequest):
    """Pass a live-mode amendment opportunity without advancing the turn."""
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found",
        )

    state = games[game_id]
    player_ids = [p["id"] for p in state["players"]]
    if request.player_id not in player_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player {request.player_id} not found in this game",
        )

    if state["settings"]["mode"] != "live":
        return {"accepted": False, "error": "Passing is only supported in live mode.", "state": state}

    if request.player_id != state.get("last_actor_id"):
        return {"accepted": False, "error": "Only the player who completed the qualifying turn may pass.", "state": state}

    allowed, reason = can_amend(state)
    if not allowed:
        return {"accepted": False, "error": reason, "state": state}

    _consume_live_amendment_opportunity(state)
    return {"accepted": True, "error": None, "state": state}


@app.get("/rulebooks")
async def list_rulebooks():
    """
    List all available rulebooks.

    Reads all .json files from rulebooks/ directory.
    """
    rulebooks = load_rulebooks()
    return rulebooks


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
