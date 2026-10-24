# AMENDMENT Backend API

FastAPI REST API for the AMENDMENT board game.

## Architecture

```
backend/
├── app.py                  # FastAPI application entry point
├── test_api.py            # API integration tests
├── requirements.txt       # Python dependencies
├── court/                 # AI Court (rule compiler)
│   ├── compiler.py
│   ├── providers/
│   └── tests/
└── engine/                # Game engine
    ├── engine.py          # Turn execution
    ├── state.py           # Game state management
    ├── validate.py        # Rule validation
    ├── board.py           # Board utilities
    └── dice.py            # Dice rolling
```

## Quick Start

### Installation

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Or use a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### Configuration

Set environment variables (optional - defaults work for local development):

```bash
# Court AI provider
export COURT_PROVIDER=ollama
export OLLAMA_MODEL=gemma3:4b
export OLLAMA_URL=http://localhost:11434

# CORS (comma-separated origins)
export ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### Running the Server

```bash
# Development mode (auto-reload)
cd backend
uvicorn app:app --reload --port 8000

# Or run directly
python3 backend/app.py
```

Server will be available at: `http://localhost:8000`

API docs: `http://localhost:8000/docs`

## API Endpoints

### Game Management

#### POST /game/new
Create a new game.

**Request:**
```json
{
  "settings": {
    "board_size": 6,
    "dice_type": "1d6",
    "win_target": 10,
    "mode": "draft",
    "max_rules": 8,
    "amend_every": null
  },
  "players": [
    {"id": "P1", "name": "Alice"},
    {"id": "P2", "name": "Bob"}
  ]
}
```

**Response:** `201 Created`
```json
{
  "game_id": "uuid-string",
  "state": { /* full game state */ }
}
```

#### GET /game/{game_id}
Get current game state.

**Response:** `200 OK`
```json
{
  "state": { /* full game state */ }
}
```

### Gameplay

#### POST /game/{game_id}/roll
Execute the current player's turn.

**Request:**
```json
{
  "player_id": "P1"
}
```

**Response:** `200 OK`
```json
{
  "state": { /* updated game state */ },
  "roll": 4
}
```

#### POST /game/{game_id}/amend
Submit a natural language amendment.

**Request:**
```json
{
  "player_id": "P1",
  "text": "When you land, gain 2 extra points"
}
```

**Response:** `200 OK`
```json
{
  "accepted": true,
  "rule": {
    "id": "A1",
    "trigger": "on_land",
    "condition": {"mode": "all", "predicates": []},
    "effect": {"type": "add_score", "amount": 2, "target": "self"},
    "immutable": false,
    "source": "When you land, gain 2 extra points"
  },
  "error": null,
  "state": { /* updated game state */ }
}
```

### Resources

#### GET /rulebooks
List all available rulebooks.

**Response:** `200 OK`
```json
[
  {
    "name": "Chaos Mode",
    "board_sizes": [6, 8],
    "rules": [ /* array of rules */ ]
  }
]
```

## Testing

```bash
# Run all backend tests
python3 -m pytest backend/ -v

# Run specific test files
python3 -m pytest backend/test_api.py -v
python3 -m pytest backend/court/test_compiler.py -v

# Run with coverage
python3 -m pytest backend/ --cov=backend --cov-report=html
```

## Game State Schema

Full game state returned by all endpoints:

```json
{
  "game_id": "uuid-string",
  "phase": "playing",
  "settings": {
    "board_size": 6,
    "dice_type": "1d6",
    "win_target": 10,
    "mode": "draft",
    "max_rules": 8,
    "amend_every": null
  },
  "players": [
    {
      "id": "P1",
      "name": "Alice",
      "position": 5,
      "score": 3,
      "skip_next": false
    }
  ],
  "current_player": 0,
  "turn": 5,
  "last_roll": 4,
  "moves_since_amend": 2,
  "rules": [
    {
      "id": "R2",
      "trigger": "on_land",
      "condition": {"mode": "all", "predicates": []},
      "effect": {"type": "add_score", "amount": 1, "target": "self"},
      "immutable": true,
      "source": "Base rule R2"
    }
  ],
  "log": [
    {
      "turn": 5,
      "player": "P1",
      "rule_id": "R2",
      "effect": "add_score",
      "before": 2,
      "after": 3,
      "details": null
    }
  ],
  "leaderboard": [
    {
      "player_id": "P1",
      "name": "Alice",
      "score": 3,
      "rank": 1,
      "last_delta": 1
    }
  ],
  "winner": null,
  "rulebook_info": null
}
```

## Error Handling

API returns appropriate HTTP status codes:

- `200 OK` - Success (including rejected amendments)
- `201 Created` - Game created
- `400 Bad Request` - Invalid request (wrong player, invalid settings, etc.)
- `404 Not Found` - Game or player not found
- `500 Internal Server Error` - Server error

Error response format:
```json
{
  "detail": "Error message"
}
```

## Development Notes

### In-Memory Storage

Games are stored in memory for the hackathon MVP. In production, replace with a database:

```python
# Replace this:
games: Dict[str, dict] = {}

# With database integration:
# from database import GameRepository
# game_repo = GameRepository()
```

### Deterministic RNG

For testing, the RNG can be injected:

```python
from backend.app import set_rng_factory
import random

# Set deterministic RNG for tests
def test_rng_factory():
    return random.Random(42)

set_rng_factory(test_rng_factory)
```

### CORS Configuration

Configure allowed origins via environment variable:

```bash
export ALLOWED_ORIGINS=http://localhost:3000,https://yourfrontend.com
```

## Deployment

### Local Development
```bash
uvicorn backend.app:app --reload --port 8000
```

### Production
```bash
# Install production dependencies
pip install gunicorn

# Run with Gunicorn
gunicorn backend.app:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### Environment Variables

Required for production:
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins
- `COURT_PROVIDER` - `ollama` or `gemini`
- `OLLAMA_MODEL` or `GEMINI_API_KEY` (depending on provider)

## Integration with Frontend

The frontend should:

1. **Create a game** via `POST /game/new`
2. **Poll for state** via `GET /game/{id}` or use WebSockets (future enhancement)
3. **Execute turns** via `POST /game/{id}/roll`
4. **Submit amendments** via `POST /game/{id}/amend`

All responses include the full updated game state, so the frontend can sync immediately.

## License

Apache-2.0
