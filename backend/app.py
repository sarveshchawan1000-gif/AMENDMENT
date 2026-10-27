"""
FastAPI backend for AMENDMENT board game.

Provides REST API for game creation, state retrieval, turn execution, and amendments.
"""

import os
import json
import sys
import time
import asyncio
import random
import threading
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import jsonschema

# Ensure parent directory is in sys.path so imports work regardless of working directory
_backend_dir = Path(__file__).resolve().parent
_repo_root = _backend_dir.parent
for _p in [str(_repo_root), str(_backend_dir)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

import copy

# Engine imports
from backend.engine.state import create_game, add_amendment, select_rulebook
from backend.engine.engine import execute_turn
from backend.engine.validate import can_amend, validate_rule as engine_validate_rule
from backend.engine.amendment_library import get_amendment_by_id, get_valid_amendments
from backend.engine.suggestions import get_player_suggestions

# Court imports
from backend.court.compiler import compile_amendment
from backend.court.config import CourtConfig
from backend.court.providers import get_provider

# Rules Book persistence imports
from backend.rules_book import (
    init_hybrid_rules_book,
    load_rules_book,
    add_rule_to_book,
    save_rules_book,
)


# --- Configuration ---

app = FastAPI(
    title="AMENDMENT API",
    description="A board game where players rewrite the rules by typing plain English",
    version="1.0.0"
)

# CORS middleware for frontend integration
raw_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
ALLOWED_ORIGINS = [o.strip() for o in raw_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in ALLOWED_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=True if "*" not in ALLOWED_ORIGINS else False,
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
    win_target: int = Field(..., description="Score needed to win (21-64)")
    mode: str = Field(..., description="Game mode: draft, live, or hybrid")
    max_rules: int = Field(..., description="Maximum rules (8, 12, or 16)")
    amend_every: Optional[int] = Field(None, description="For live mode: amend every N moves (1 or 2)")
    rulebook_name: Optional[str] = Field(None, description="Optional rulebook name/id to load in hybrid mode")
    starting_rule_ids: Optional[List[str]] = Field(None, description="Optional list of canonical rule IDs (AMEND_001–AMEND_100) to load as starting rules")


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


class SuggestionItem(BaseModel):
    """Client-facing predefined amendment suggestion."""
    id: str
    title: str
    description: str
    category: str


class SuggestionsResponse(BaseModel):
    """Response for GET /game/{id}/suggestions."""
    suggestions: List[SuggestionItem]


class AmendRequest(BaseModel):
    """Request body for POST /game/{id}/amend."""
    player_id: str
    text: Optional[str] = Field(default=None, description="Natural language amendment text")
    amendment_id: Optional[str] = Field(default=None, description="Predefined amendment ID")


class AmendResponse(BaseModel):
    """Response for POST /game/{id}/amend."""
    accepted: bool
    category: Optional[str] = None
    rule: Optional[dict]
    error: Optional[str]
    state: dict


class CourtCompileSettings(BaseModel):
    """Settings passed to stateless /court/compile."""
    board_size: int = Field(default=6, description="Grid dimension")
    dice_type: str = Field(default="1d6", description="Dice configuration")
    win_target: int = Field(default=21, description="Score needed to win")
    max_rules: int = Field(default=8, description="Maximum rules allowed")
    mode: Optional[str] = Field(default="draft", description="Game mode")


class CourtCompileRequest(BaseModel):
    """Request for stateless POST /court/compile."""
    text: str = Field(..., description="Natural language proposal text")
    settings: Optional[CourtCompileSettings] = None
    accepted_rules: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class CourtCompileResponse(BaseModel):
    """Response for stateless POST /court/compile."""
    accepted: bool
    category: Optional[str] = None
    rule: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class CourtHealthResponse(BaseModel):
    """Response for GET /court/health."""
    provider: str
    model: str
    ollama_reachable: bool
    model_installed: bool
    message: str


class RulesBookItemResponse(BaseModel):
    """Entry in the Hybrid Mode Rules Book."""
    id: str
    game_id: str
    original_text: str
    description: str
    compiled_rule: Dict[str, Any]
    proposer_id: str
    proposer_name: str
    created_at: str
    status: str
    order: int


class RulesBookResponse(BaseModel):
    """Response for GET /game/{id}/rules-book."""
    game_id: str
    mode: str
    rules: List[RulesBookItemResponse]


# --- Helper Functions ---

def get_project_root() -> Path:
    """Get the project root directory (parent of backend/)."""
    # backend/app.py -> backend/ -> project root
    return Path(__file__).resolve().parent.parent


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

            # Validate each rule using engine validator and ensure canonical consistency
            all_rules_valid = True
            for idx, rule in enumerate(rulebook["rules"]):
                rule_id = rule.get("id")
                # Reject invalid test fixtures AMEND_901–AMEND_904
                if rule_id and (rule_id.startswith("AMEND_9") or rule_id in ["AMEND_901", "AMEND_902", "AMEND_903", "AMEND_904"]):
                    print(f"Skipping {filepath.name}: Rule {idx} is invalid test fixture {rule_id}", file=sys.stderr)
                    all_rules_valid = False
                    break

                valid, error = engine_validate_rule(rule)
                if not valid:
                    print(f"Skipping {filepath.name}: Rule {idx} invalid - {error}", file=sys.stderr)
                    all_rules_valid = False
                    break

                # Enrich with canonical catalog metadata if rule ID exists in catalog
                if rule_id:
                    canon_entry = get_amendment_by_id(rule_id)
                    if canon_entry:
                        rule.setdefault("title", canon_entry.get("title", ""))
                        rule.setdefault("description", canon_entry.get("description", ""))
                        rule.setdefault("category", canon_entry.get("category", "general"))
                        if not rule.get("source") and canon_entry.get("rule_payload", {}).get("source"):
                            rule["source"] = canon_entry["rule_payload"]["source"]

            if not all_rules_valid:
                continue

            # Assign id matching file stem if absent
            rulebook.setdefault("id", filepath.stem)

            # All validations passed
            rulebooks.append(rulebook)

        except Exception as e:
            print(f"Skipping {filepath.name}: Unexpected error - {e}", file=sys.stderr)
            continue

    return rulebooks


# --- Static Files & Frontend Paths ---
_frontend_dist = get_project_root() / "frontend" / "dist"
if not _frontend_dist.exists():
    _frontend_dist = Path("/var/task/frontend/dist")

if _frontend_dist.exists() and (_frontend_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")


# --- API Endpoints ---

@app.get("/")
async def root():
    """Serve frontend index.html if built, otherwise API health check."""
    index_file = _frontend_dist / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {
        "name": "AMENDMENT API",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/api")
@app.get("/api/health")
async def api_health():
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

    if not (21 <= settings_dict["win_target"] <= 64):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="win_target must be between 21 and 64"
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
        if settings_dict.get("starting_rule_ids"):
            requested_ids = settings_dict["starting_rule_ids"]
            if not isinstance(requested_ids, list) or len(requested_ids) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="starting_rule_ids must be a non-empty list of rule IDs"
                )
            selected_rules = []
            for rid in requested_ids:
                if not isinstance(rid, str) or rid.startswith("AMEND_9") or rid in ["AMEND_901", "AMEND_902", "AMEND_903", "AMEND_904"]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid rule fixture {rid} not allowed"
                    )
                entry = get_amendment_by_id(rid)
                if not entry:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Rule ID {rid} not found in canonical amendment library"
                    )
                vmeta = entry.get("validation_metadata", {})
                if vmeta.get("is_valid") is not True:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Rule ID {rid} is flagged as invalid"
                    )
                min_board = vmeta.get("min_board_size")
                if min_board and settings_dict["board_size"] < min_board:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Rule {rid} requires minimum board size {min_board}"
                    )
                valid, err = engine_validate_rule(entry["rule_payload"])
                if not valid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Rule {rid} failed engine validation: {err}"
                    )
                r_payload = copy.deepcopy(entry["rule_payload"])
                r_payload["id"] = rid
                r_payload["title"] = entry.get("title", "")
                r_payload["description"] = entry.get("description", "")
                r_payload["category"] = entry.get("category", "general")
                if not r_payload.get("source"):
                    r_payload["source"] = entry.get("description", "")
                selected_rules.append(r_payload)

            rulebook = {
                "id": "custom-rulebook",
                "name": settings_dict.get("rulebook_name") or "Custom Amendment Accord",
                "board_sizes": [6, 8, 10],
                "rules": selected_rules,
            }
        else:
            rulebooks = load_rulebooks()
            if not rulebooks:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="No rulebooks available for hybrid mode"
                )

            try:
                rng = get_rng()
                if settings_dict.get("rulebook_name"):
                    target = str(settings_dict["rulebook_name"]).strip().lower()
                    matching = [
                        rb for rb in rulebooks
                        if rb.get("name", "").strip().lower() == target
                        or rb.get("id", "").strip().lower() == target
                    ]
                    compatible_matching = [
                        rb for rb in matching
                        if "board_sizes" not in rb or not rb["board_sizes"]
                        or settings_dict["board_size"] in rb["board_sizes"]
                    ]
                    if compatible_matching:
                        rulebook = compatible_matching[0]
                    else:
                        rulebook = select_rulebook(rulebooks, settings_dict["board_size"], rng)
                else:
                    rulebook = select_rulebook(rulebooks, settings_dict["board_size"], rng)
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No compatible rulebook found: {e}"
                )

    # Create game state
    try:
        # Default amend_every for hybrid mode if omitted
        if settings_dict["mode"] == "hybrid" and not settings_dict.get("amend_every"):
            settings_dict["amend_every"] = 1

        state = create_game(settings_dict, players_list, rulebook)
        game_id = state["game_id"]

        # Initialize persistent Rules Book for Hybrid Mode
        if state["settings"]["mode"] == "hybrid":
            rulebook_name = rulebook.get("name", "Curated Rulebook") if rulebook else "Curated Rulebook"
            state["rules_book"] = init_hybrid_rules_book(
                game_id=game_id,
                mode="hybrid",
                initial_rules=state["rules"],
                rulebook_name=rulebook_name,
            )

        games[game_id] = state

        return CreateGameResponse(game_id=game_id, state=state)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create game: {e}"
        )


AMENDMENT_TIMEOUT_SECONDS: float = 60.0


def _consume_live_amendment_opportunity(state: dict) -> None:
    """Close the current live-mode amendment opportunity and clear amendment phase."""
    if state["settings"]["mode"] == "live":
        state["moves_since_amend"] = 0
    state["amendment_phase"] = None


def _advance_turn(state: dict) -> None:
    """Advance current_player to the next player."""
    if state["phase"] != "finished":
        players = state["players"]
        current_idx = state["current_player"]
        state["current_player"] = (current_idx + 1) % len(players)


def _check_and_resolve_expiry(state: dict) -> bool:
    """If an amendment phase deadline has passed, resolve it and advance turn."""
    phase_info = state.get("amendment_phase")
    if not phase_info or not phase_info.get("active"):
        return False

    deadline = phase_info.get("deadline", 0)
    now = time.time()
    if now >= deadline:
        _consume_live_amendment_opportunity(state)
        _advance_turn(state)
        return True
    return False


async def _schedule_amendment_expiry(game_id: str, deadline: float):
    """Asynchronously wait for the deadline and resolve expiry if still active."""
    delay = max(0.0, deadline - time.time())
    await asyncio.sleep(delay)
    if game_id in games:
        state = games[game_id]
        phase_info = state.get("amendment_phase")
        if phase_info and phase_info.get("active") and phase_info.get("deadline") == deadline:
            _consume_live_amendment_opportunity(state)
            _advance_turn(state)


@app.get("/game/{game_id}", response_model=GetStateResponse)
async def get_game_state(game_id: str):
    """Get the current state of a game."""
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    state = games[game_id]
    _check_and_resolve_expiry(state)
    if state["settings"]["mode"] == "hybrid":
        state["rules_book"] = load_rules_book(game_id) or []
    return GetStateResponse(state=state)


@app.post("/game/{game_id}/roll", response_model=ExecuteTurnResponse)
async def execute_player_turn(game_id: str, request: ExecuteTurnRequest):
    """
    Execute the current player's turn.

    Validates that the specified player_id matches the current player.
    Processes the dice roll, movement, and scoring.
    
    If an amendment opportunity is available after the roll, enters an
    authoritative 60-second amendment phase and rewinds current_player
    back to the legislator until the phase is resolved.
    """
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    state = games[game_id]
    _check_and_resolve_expiry(state)

    # Check if game is finished
    if state["phase"] == "finished":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Game is already finished"
        )

    # Check if an amendment phase is currently pending
    phase_info = state.get("amendment_phase")
    if phase_info and phase_info.get("active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amendment phase is currently active for player {phase_info['player_id']}. Cannot roll until the amendment phase is resolved."
        )

    # Validate player_id matches current player
    current_player_idx = state["current_player"]
    current_player = state["players"][current_player_idx]

    if current_player["id"] != request.player_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not {request.player_id}'s turn. Current player is {current_player['id']}"
        )

    # Remember who rolled BEFORE executing
    rolling_player_idx = current_player_idx

    # Execute turn with injectable RNG (this advances current_player)
    rng = get_rng()
    execute_turn(state, rng)

    roll = state["last_roll"]

    # Check if game finished from this roll
    if state["phase"] == "finished":
        state["amendment_phase"] = None
        return ExecuteTurnResponse(state=state, roll=roll)

    # Check if an amendment opportunity is available
    amend_available, _ = can_amend(state)
    
    # If amendment is available, enter authoritative 60-second amendment phase
    if amend_available:
        state["current_player"] = rolling_player_idx
        now = time.time()
        deadline = now + AMENDMENT_TIMEOUT_SECONDS
        state["amendment_phase"] = {
            "active": True,
            "player_id": state["players"][rolling_player_idx]["id"],
            "started_at": now,
            "deadline": deadline,
            "duration": int(AMENDMENT_TIMEOUT_SECONDS),
        }
        asyncio.create_task(_schedule_amendment_expiry(game_id, deadline))
    else:
        state["amendment_phase"] = None

    return ExecuteTurnResponse(state=state, roll=roll)


@app.get("/game/{game_id}/suggestions", response_model=SuggestionsResponse)
async def get_suggestions_endpoint(game_id: str, player_id: str):
    """Return deterministic, player-specific predefined amendment suggestions."""
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found",
        )

    state = games[game_id]
    _check_and_resolve_expiry(state)

    player_ids = [p["id"] for p in state["players"]]
    if player_id not in player_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Player {player_id} not found in this game",
        )

    try:
        suggestions = get_player_suggestions(state, player_id)
        return SuggestionsResponse(suggestions=[SuggestionItem(**s) for s in suggestions])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get suggestions: {e}",
        )


@app.post("/game/{game_id}/amend", response_model=AmendResponse)
async def submit_amendment(game_id: str, request: AmendRequest):
    """
    Submit an amendment (either a predefined amendment_id or custom text).

    Checks amendment eligibility, validates/compiles the rule,
    and adds it to the game state if accepted.
    After handling the amendment, advances to the next player.
    """
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found"
        )

    state = games[game_id]
    _check_and_resolve_expiry(state)

    # Validate exactly one of text or amendment_id is supplied
    has_text = bool(request.text and request.text.strip())
    has_id = bool(request.amendment_id and request.amendment_id.strip())
    if has_text == has_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exactly one of 'text' or 'amendment_id' must be provided",
        )

    # Validate player exists
    player_ids = [p["id"] for p in state["players"]]
    if request.player_id not in player_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player {request.player_id} not found in this game"
        )

    # Hybrid mode rules are strictly fixed from the starting rulebook
    if state["settings"]["mode"] == "hybrid":
        return AmendResponse(
            accepted=False,
            rule=None,
            error="Amendments not allowed in hybrid mode. Rules are fixed.",
            state=state,
        )

    is_live = state["settings"]["mode"] == "live"
    phase_info = state.get("amendment_phase")

    # Check whether an amendment opportunity currently exists in engine
    allowed, reason = can_amend(state)
    if not allowed:
        return AmendResponse(
            accepted=False,
            rule=None,
            error=reason,
            state=state
        )

    # In live mode: require active amendment phase and authorized player
    if is_live:
        if not phase_info or not phase_info.get("active"):
            return AmendResponse(
                accepted=False,
                rule=None,
                error="Amend not available: No active amendment phase or deadline has expired.",
                state=state,
            )
        if request.player_id != phase_info.get("player_id"):
            return AmendResponse(
                accepted=False,
                rule=None,
                error=f"Only the player who completed the qualifying turn ({phase_info.get('player_id')}) may amend during this opportunity.",
                state=state,
            )

    def _resolve_opportunity():
        if is_live:
            _consume_live_amendment_opportunity(state)
            _advance_turn(state)
        else:
            _advance_turn(state)

    # Route 1: Predefined amendment (bypasses LLM compilation completely)
    if has_id:
        entry = get_amendment_by_id(request.amendment_id.strip())
        if not entry:
            _resolve_opportunity()
            return AmendResponse(
                accepted=False,
                category="invalid_rule",
                rule=None,
                error=f"Unknown amendment ID: {request.amendment_id}",
                state=state,
            )

        rule_payload = copy.deepcopy(entry.get("rule_payload", {}))
        valid, val_err = engine_validate_rule(rule_payload)
        if not valid:
            _resolve_opportunity()
            return AmendResponse(
                accepted=False,
                category="invalid_rule",
                rule=None,
                error=f"Invalid rule: {val_err}",
                state=state,
            )

        success, error = add_amendment(state, rule_payload)
        if not success:
            _resolve_opportunity()
            return AmendResponse(
                accepted=False,
                category="invalid_rule",
                rule=None,
                error=error,
                state=state,
            )

    # Route 2: Custom natural language proposal (invokes AI Court)
    else:
        try:
            court_response = compile_amendment(request.text.strip(), state, engine_validate_rule)
        except Exception as e:
            # Infrastructure failure: do NOT consume opportunity or advance turn
            return AmendResponse(
                accepted=False,
                category="court_error",
                rule=None,
                error=f"Court compilation failed: {e}",
                state=state
            )

        # Provider / connection error: do NOT consume opportunity or advance turn
        if court_response.get("category") == "court_error":
            return AmendResponse(
                accepted=False,
                category="court_error",
                rule=None,
                error=court_response.get("error", "Court AI provider is not available"),
                state=state
            )

        # Check if deadline expired while AI was processing
        if is_live:
            curr_phase = state.get("amendment_phase")
            if not curr_phase or not curr_phase.get("active") or time.time() >= curr_phase.get("deadline", 0):
                _resolve_opportunity()
                return AmendResponse(
                    accepted=False,
                    category="invalid_rule",
                    rule=None,
                    error="Amendment deadline expired before deliberation finished.",
                    state=state
                )

        # If Court rejected (not a game rule / invalid rule), consume opportunity and advance turn
        if not court_response["accepted"]:
            _resolve_opportunity()
            return AmendResponse(
                accepted=False,
                category=court_response.get("category", "invalid_rule"),
                rule=None,
                error=court_response["error"],
                state=state
            )

        rule = court_response["rule"]
        success, error = add_amendment(state, rule)
        if not success:
            _resolve_opportunity()
            return AmendResponse(
                accepted=False,
                category="invalid_rule",
                rule=None,
                error=error,
                state=state
            )

    added_rule = state["rules"][-1]
    _resolve_opportunity()

    return AmendResponse(
        accepted=True,
        category="accepted",
        rule=added_rule,
        error=None,
        state=state
    )


@app.post("/game/{game_id}/pass-amendment")
async def pass_amendment(game_id: str, request: ExecuteTurnRequest):
    """Pass a live-mode amendment opportunity and advance to the next player."""
    if game_id not in games:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found",
        )

    state = games[game_id]
    _check_and_resolve_expiry(state)

    player_ids = [p["id"] for p in state["players"]]
    if request.player_id not in player_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player {request.player_id} not found in this game",
        )

    if state["settings"]["mode"] != "live":
        return {"accepted": False, "error": "Passing is only supported in live mode.", "state": state}

    phase_info = state.get("amendment_phase")
    if phase_info and phase_info.get("active"):
        if request.player_id != phase_info.get("player_id"):
            return {
                "accepted": False,
                "error": f"Only the player who completed the qualifying turn ({phase_info.get('player_id')}) may pass during this opportunity.",
                "state": state
            }
    else:
        if request.player_id != state.get("last_actor_id"):
            return {
                "accepted": False,
                "error": "Only the player who completed the qualifying turn may pass.",
                "state": state
            }
        allowed, reason = can_amend(state)
        if not allowed:
            return {"accepted": False, "error": reason or "No active amendment opportunity to pass.", "state": state}

    _consume_live_amendment_opportunity(state)
    _advance_turn(state)
    return {"accepted": True, "error": None, "state": state}


@app.get("/game/{game_id}/rules-book", response_model=RulesBookResponse)
async def get_rules_book_endpoint(game_id: str):
    """
    Get the persistent Rules Book for a specific Hybrid Mode game.

    The backend is the authoritative source of truth.
    Returns clear errors for invalid game IDs or unavailable games.
    """
    # Check in-memory games
    if game_id in games:
        game_mode = games[game_id]["settings"]["mode"]
        if game_mode != "hybrid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Rules Book is only available for Hybrid Mode games (game is in '{game_mode}' mode)"
            )
        rules = load_rules_book(game_id) or []
        return RulesBookResponse(game_id=game_id, mode="hybrid", rules=rules)

    # If game not in memory (e.g. server reload), check if persisted on disk
    persisted_rules = load_rules_book(game_id)
    if persisted_rules is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found or no Rules Book available"
        )

    return RulesBookResponse(game_id=game_id, mode="hybrid", rules=persisted_rules)


@app.on_event("startup")
async def startup_event():
    """Startup event handler: logs provider mode and warms up model in background."""
    # Task 6b: Log Court provider on startup
    if CourtConfig.PROVIDER == "ollama":
        print(f"Court provider: ollama (local, {CourtConfig.OLLAMA_MODEL})")
    elif CourtConfig.PROVIDER == "gemini":
        print("WARNING: Court provider: gemini (HOSTED) - sending game data to hosted service!")
    else:
        print(f"Court provider: {CourtConfig.PROVIDER}")

    # Task 4b: Warm the model with a tiny request in a background thread
    def _warmup():
        try:
            if CourtConfig.PROVIDER == "ollama":
                provider = get_provider()
                if provider.is_available():
                    provider.generate(
                        prompt="warmup",
                        system_prompt="Respond with OK.",
                    )
        except Exception as e:
            print(f"Warning: Court warm-up failed (non-blocking): {e}", file=sys.stderr)

    warmup_thread = threading.Thread(target=_warmup, daemon=True)
    warmup_thread.start()


@app.get("/court/health", response_model=CourtHealthResponse)
async def court_health_endpoint():
    """
    Health check endpoint for the Court AI provider.
    Returns status of Ollama connectivity and model installation.
    """
    try:
        provider = get_provider()
        if hasattr(provider, "availability_detail"):
            reachable, model_ok, message = provider.availability_detail()
        else:
            reachable = provider.is_available()
            model_ok = reachable
            message = "Model ready" if reachable else "Provider not available"

        return CourtHealthResponse(
            provider=CourtConfig.PROVIDER,
            model=getattr(provider, "model", getattr(CourtConfig, "OLLAMA_MODEL", "gemma3:4b")),
            ollama_reachable=reachable,
            model_installed=model_ok,
            message=message,
        )
    except Exception as e:
        return CourtHealthResponse(
            provider=CourtConfig.PROVIDER,
            model=getattr(CourtConfig, "OLLAMA_MODEL", "gemma3:4b"),
            ollama_reachable=False,
            model_installed=False,
            message=f"Error checking Court health: {e}",
        )


@app.post("/court/compile", response_model=CourtCompileResponse)
async def court_compile_endpoint(request: CourtCompileRequest):
    """
    Stateless endpoint to compile a natural language rule proposal into an engine rule.
    Does NOT require a game_id, does NOT mutate any game state, and does NOT consume
    amendment opportunities.
    """
    settings_dict = (
        request.settings.model_dump()
        if request.settings
        else {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 21,
            "max_rules": 8,
            "mode": "draft",
        }
    )
    state = {
        "settings": settings_dict,
        "rules": request.accepted_rules or [],
        "players": [],
    }

    try:
        result = compile_amendment(request.text, state, engine_validate_rule)
    except Exception as e:
        return CourtCompileResponse(
            accepted=False,
            category="court_error",
            rule=None,
            error=f"Court compilation failed: {e}",
        )

    return CourtCompileResponse(
        accepted=result["accepted"],
        category=result.get("category"),
        rule=result.get("rule"),
        error=result.get("error"),
    )


@app.get("/rulebooks")
async def list_rulebooks():
    """
    List all available rulebooks.

    Reads all .json files from rulebooks/ directory.
    """
    rulebooks = load_rulebooks()
    return rulebooks


@app.get("/rules/predefined")
async def list_predefined_rules():
    """Return all valid predefined rules from the canonical catalog (AMEND_001–AMEND_100)."""
    return get_valid_amendments()


@app.get("/{full_path:path}")
async def serve_spa_fallback(full_path: str):
    """Fallback to frontend index.html for client-side routing."""
    index_file = _frontend_dist / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":

    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
