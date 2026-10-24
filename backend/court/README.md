# Court - AI Rule Compiler

> **Local-First Guarantee**: The default and supported mode for AMENDMENT is local Ollama with `gemma3:4b`.
> All rule compilation and natural language understanding happens entirely on your local machine.
> No data leaves your machine unless `COURT_PROVIDER=gemini` is explicitly set in your environment.

The Court transforms plain English amendments into validated JSON rules using LLM providers.

## Architecture

```
backend/court/
├── __init__.py              # Public API
├── config.py                # Configuration from environment
├── compiler.py              # Natural language → JSON compiler
├── providers/               # LLM provider abstraction
│   ├── base.py             # Abstract provider interface
│   ├── ollama.py           # Local Ollama provider
│   └── gemini.py           # Hosted Gemini provider (TODO)
├── test_compiler.py         # Unit tests (mocked provider)
├── test_integration.py      # Integration tests with engine validator
└── README.md               # This file
```

## Compiler

The core function `compile_amendment(text, state, validate_rule_fn)` converts player text into validated rules:

```python
from backend.court import compile_amendment
from backend.engine.validate import validate_rule

state = {
    "settings": {"board_size": 6, "dice_type": "1d6", "win_target": 10, "max_rules": 8},
    "rules": [{"id": "R2"}],
    "players": []
}

result = compile_amendment(
    "When you land, gain 2 extra points",
    state,
    validate_rule
)

# result = {
#   "accepted": True,
#   "rule": {
#     "trigger": "on_land",
#     "condition": {"mode": "all", "predicates": []},
#     "effect": {"type": "add_score", "amount": 2, "target": "self"},
#     "source": "When you land, gain 2 extra points"
#   },
#   "error": None
# }
```

### Features

- **LLM-powered interpretation**: Uses configured provider (Ollama/Gemini) to understand natural language
- **Automatic JSON extraction**: Handles markdown code fences, raw JSON, malformed responses
- **Retry logic**: Automatically retries on malformed JSON (configurable via `COURT_MAX_RETRIES`)
- **Engine validation**: Validates against engine rules (triggers, predicates, effects, amounts)
- **Safe parsing**: Uses `json.loads()`, never `eval()`
- **Context-aware**: Includes game state in prompt (board size, current rules, win target)
- **Graceful degradation**: Returns clear errors on provider failure, timeout, or validation failure

## Provider Layer

The provider layer abstracts LLM interactions with a clean interface:

```python
from backend.court.providers import get_provider

provider = get_provider()  # Auto-selects based on COURT_PROVIDER env var

# Generate text
response = provider.generate(
    prompt="Propose a rule that rewards even dice rolls",
    system_prompt="You are a game rule judge...",
    json_schema={...}  # Optional: structured output
)

# Check availability
if provider.is_available():
    print("Provider ready!")
```

## Configuration

Set environment variables (see `backend/.env.example`):

```bash
# Use local Ollama (default)
export COURT_PROVIDER=ollama
export OLLAMA_MODEL=gemma3:4b
export OLLAMA_URL=http://localhost:11434

# Or use hosted Gemini (production)
export COURT_PROVIDER=gemini
export GEMINI_API_KEY=your-key-here
export GEMINI_MODEL=gemini-2.0-flash-exp

# Compilation settings
export COURT_TEMPERATURE=0.0    # 0=deterministic, 1=creative
export COURT_MAX_RETRIES=1      # Retry attempts for invalid JSON
```

## Testing

```bash
# Unit tests (mocked provider, no Ollama needed)
python3 -m pytest backend/court/test_compiler.py -v

# Integration tests (with engine validator)
python3 -m pytest backend/court/test_integration.py -v

# All Court tests
python3 -m pytest backend/court/ -v

# E2E test (requires Ollama running)
python3 scripts/test_compiler_e2e.py

# Provider connectivity test
python3 scripts/test_provider.py
```

## Error Handling

The compiler handles multiple failure modes gracefully:

| Scenario | Behavior |
|----------|----------|
| Provider unavailable | Returns `{"accepted": false, "error": "Court AI provider is not available"}` |
| Timeout | Returns `{"accepted": false, "error": "Court request timed out..."}` |
| Malformed JSON | Retries up to `MAX_RETRIES`, then returns error |
| Invalid trigger/effect | Validated by engine, returns specific validation error |
| Amount exceeds cap | Rejected with `"Effect amount X exceeds ±5 cap"` |
| Missing required field | Rejected with `"Missing 'trigger'"` (or effect/condition) |

## Integration with Engine

The compiler output is designed to integrate seamlessly with the engine:

```python
# 1. Call compiler
result = compile_amendment(text, state, validate_rule)

# 2. Check acceptance
if not result["accepted"]:
    return {"error": result["error"]}

# 3. Add to game state (engine handles id assignment and immutable flag)
rule = result["rule"]  # Already validated
state["rules"].append(rule)
```

The rule from the compiler does NOT include `id` or `immutable` - the engine assigns those via `add_amendment()`.

## Architecture Benefits

✅ **Clean Separation**
- Provider layer is independent of Court logic
- Easy to add new providers (Gemini, Claude, etc.)
- Testable in isolation

✅ **Environment-Driven**
- Same code works for development (Ollama) and production (Gemini)
- No hardcoded endpoints or keys
- Configuration validated on startup

✅ **Error Handling**
- Specific exception types for different failures
- Clear error messages with troubleshooting guidance
- Graceful degradation (availability checks)

✅ **Structured Output Support**
- JSON schema support for Ollama's `format` parameter
- Ready for Gemini's `response_schema` when implemented
- Falls back gracefully if not supported

✅ **Modular Design**
- Each component has single responsibility
- Easy to extend (add validation, prompt building, etc.)
- Clear boundaries between layers
