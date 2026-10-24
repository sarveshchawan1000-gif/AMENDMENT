# AMENDMENT Integration Contract

**Source of truth** for the rule format, game state, Court response, and API
endpoints.  All three teams (frontend, engine, Court) code against this document.

The deterministic engine (`backend/engine/`) validates and executes rules.
The Court (Gemma via Ollama, `backend/court/`) compiles natural language into
structured rules.  The Court never mutates game state directly — it only
outputs a rule that the engine validates and inserts.

---

## 1. Rule JSON Format

A rule describes when something happens (trigger), under what conditions
(condition), and what it does (effect).

```json
{
  "id": "A1",
  "trigger": "on_land",
  "condition": {
    "mode": "all",
    "predicates": []
  },
  "effect": {
    "type": "add_score",
    "amount": 2,
    "target": "self"
  },
  "immutable": false,
  "source": "when you land, gain 2 extra points"
}
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | No (engine-assigned) | `"R2"` for base rule; `"A1"`, `"A2"`, ... for amendments. Not present in rulebook files. |
| `trigger` | string | **Yes** | When the rule fires. See [Triggers](#4-supported-triggers). |
| `condition` | object | **Yes** | When the rule's effect applies. See below. |
| `effect` | object | **Yes** | What the rule does. See below. |
| `immutable` | boolean | No (defaults false) | `true` only for R2. Engine overrides to `false` on rulebook load. |
| `source` | string | No | Original English text or description. |

### Condition object

```json
{
  "mode": "all",
  "predicates": [
    {"name": "roll_is_even"},
    {"name": "score_gt", "args": {"value": 5}}
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | string | **Yes** | `"all"` (all predicates must be true) or `"any"` (at least one). |
| `predicates` | array | **Yes** | List of predicate objects. Empty array = always true. |

### Predicate object

```json
{"name": "score_gt", "args": {"value": 5}}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | **Yes** | One of the valid predicate names (see below). |
| `args` | object | Only for `score_gt` | Contains `{"value": int}`. Required when `name` is `score_gt`. |

### Effect object

```json
{
  "type": "add_score",
  "amount": 2,
  "target": "self"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | **Yes** | One of the valid effect types (see below). |
| `amount` | integer | **Yes** | Effect magnitude. See [Validation Constraints](#5-field-types-limits-and-validation-constraints). |
| `target` | string | **Yes** | Who the effect applies to. |

---

## 2. Game State JSON Format

Returned by `create_game()` and updated by `execute_turn()`.  The full state
is returned by every API endpoint.

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
    {"id": "P1", "name": "Alice", "position": 4, "score": 2, "skip_next": false},
    {"id": "P2", "name": "Bob", "position": 1, "score": 0, "skip_next": false}
  ],
  "current_player": 0,
  "turn": 3,
  "last_roll": 3,
  "moves_since_amend": 2,
  "rules": [],
  "log": [],
  "leaderboard": [],
  "winner": null,
  "rulebook_info": null
}
```

### Settings

| Field | Type | Description |
|---|---|---|
| `board_size` | int | Grid dimension: 6, 8, or 10. Total tiles = board_size squared (36, 64, 100). |
| `dice_type` | string | `"1d6"`, `"2d6"`, or `"1d12"`. |
| `win_target` | int | Score needed to win. Clamped to 5..30. |
| `mode` | string | `"draft"`, `"live"`, or `"hybrid"`. |
| `max_rules` | int | Maximum rules in `state.rules` (including R2): 8, 12, or 16. |
| `amend_every` | int or null | Live mode only: 1 or 2. `null` in draft/hybrid. |

### Player object

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique player identifier. |
| `name` | string | Display name. |
| `position` | int | Current tile (1-indexed, 1..N). |
| `score` | int | Current score (always >= 0). |
| `skip_next` | boolean | If true, this player's next turn is skipped. |

### Leaderboard entry

| Field | Type | Description |
|---|---|---|
| `player_id` | string | Player ID. |
| `name` | string | Display name. |
| `score` | int | Current score. |
| `rank` | int | Competition ranking (ties share rank; next skips). |
| `last_delta` | int | Acting player's net score change across the entire completed turn. Initial value 0. 0 for skipped turns. |

### Log entry

Appended every time a rule fires.

| Field | Type | Description |
|---|---|---|
| `turn` | int | Turn number when the rule fired. |
| `player` | string | Acting player's ID. |
| `rule_id` | string | ID of the rule that fired. |
| `effect` | string | Effect type string. |
| `before` | int | Acting player's score before the effect. |
| `after` | int | Acting player's score after the effect. |
| `details` | string or null | Human-readable context for debugging. |

`details` values by effect type:

| Effect | details example | When null |
|---|---|---|
| `add_score` | `"targets: P2, P3"` | When target is `"self"` |
| `steal_score` | `"stole 3 from P2"` | Never |
| `move` | `"adjustment +2"` or `"P2 pos 10->12"` | Never |
| `skip_turn` | `"target: P2, P3"` | Never |
| `reroll` | `"roll 3->6"` or `"no-op (reroll already used)"` | Never |
| `set_win_target` | `"win_target 10->15"` | Never |

### Rulebook info (hybrid mode only)

`null` in draft and live modes. Populated by `load_rulebook()` in hybrid mode.

| Field | Type | Description |
|---|---|---|
| `name` | string | Selected rulebook name. |
| `total_rules` | int | Total rules in the rulebook (excludes R2). |
| `filtered` | int | Rules removed (board-incompatible). |
| `truncated` | int | Rules removed (exceeded max_rules - 1). |
| `loaded` | int | Rules loaded into state.rules (excludes R2). |

Invariants: `total_rules = filtered + truncated + loaded`,
`len(state.rules) = loaded + 1`, `len(state.rules) <= max_rules`.

---

## 3. Court Response JSON Format

The Court (Gemma) compiles a natural-language sentence into a structured
rule.  The server calls `compile_amendment(text, state)` and receives this
response.  The Court must output only this structure — it never mutates game
state directly.

```json
{
  "accepted": true,
  "rule": {
    "trigger": "on_roll",
    "condition": {
      "mode": "all",
      "predicates": [{"name": "roll_is_even"}]
    },
    "effect": {
      "type": "add_score",
      "amount": 2,
      "target": "self"
    },
    "source": "when you roll an even number, gain 2 points"
  },
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `accepted` | boolean | `true` if the Court successfully compiled the text. |
| `rule` | object or null | The structured rule (without `id` or `immutable` — the engine assigns those). `null` if rejected. |
| `error` | string or null | Human-readable error message if `accepted` is false. `null` if accepted. |

The `rule` object in the Court response uses the same format as [Section 1](#1-rule-json-format)
except `id` and `immutable` are omitted — the engine assigns them via
`add_amendment()`.

---

## 4. Supported Triggers, Predicates, and Effects

### Triggers

Rules fire at specific phases of a turn.  Each rule fires at most once per
trigger phase per turn.

| Trigger | When it fires | Context available |
|---|---|---|
| `on_turn_start` | Before the dice roll | Player scores, positions. No `last_roll`. |
| `on_roll` | After the dice roll, before the move | `last_roll` available. Move effects targeting `self` are accumulated as movement adjustments. |
| `on_land` | After the player moves to a new tile | `last_roll` available. Player position is the landing tile. R2 fires here. |
| `win_check` | After on_land, before turn finalization | All turn effects have applied. `set_win_target` takes effect immediately. |

### Predicates

Evaluated against the acting player's current state at the time the trigger fires.

| Predicate | Checks | Args required | Available in triggers |
|---|---|---|---|
| `is_leader` | Acting player's rank == 1 (via `rank_players`) | None | All |
| `is_last` | Acting player's rank == max(ranks) | None | All |
| `roll_is_even` | `last_roll % 2 == 0` | None | on_roll, on_land, win_check (not on_turn_start) |
| `tile_is_prime` | Acting player's current position is prime | None | All (position at trigger time) |
| `score_gt` | Acting player's score > `args.value` | `args.value` (int) | All |

### Effects

| Effect | What it does | Amount | Target behavior |
|---|---|---|---|
| `add_score` | Add `amount` to each resolved target's score (floors at 0) | +/-5 | Applies to all resolved targets |
| `steal_score` | Transfer points from a single target to the acting player (target floors at 0) | abs(+/-5) | Single non-self target; first by players[] index on ties |
| `move` | Move resolved targets by `amount` tiles (wrapping). `on_roll` + `self` = movement adjustment; all others = immediate reposition | +/-5 | All resolved targets (add_score-style) or single (steal) |
| `skip_turn` | Set `skip_next = true` on resolved targets | 0 (unused) | All resolved targets |
| `reroll` | Replace `last_roll` with a new roll. One per turn max. | 0 (unused) | Ignored (always acting player) |
| `set_win_target` | Change `settings.win_target` globally | 5..30 | Ignored (global) |

### Effect target semantics

| Target | Resolves to |
|---|---|
| `self` | The acting player only |
| `leader` | All players at rank 1 (can include the acting player) |
| `last` | All players at the lowest rank (can include the acting player) |
| `all_others` | All players except the acting player |

For `add_score`, `move`, `skip_turn`: effect applies to every resolved target.
For `steal_score`: resolves to a single non-self target (first by `players[]`
index on ties). If the only target is the acting player, it is a no-op.

---

## 5. Field Types, Limits, and Validation Constraints

Validated by `validate_rule()` in `backend/engine/validate.py`.

| Constraint | Rule |
|---|---|
| `trigger` | Must be one of: `on_turn_start`, `on_roll`, `on_land`, `win_check` |
| `condition.mode` | Must be `all` or `any` |
| `condition.predicates` | Array; each predicate must have a valid `name` |
| `score_gt` predicate | Requires `args.value` (integer) |
| `effect.type` | Must be one of: `add_score`, `steal_score`, `move`, `skip_turn`, `reroll`, `set_win_target` |
| `effect.amount` | Must be an integer |
| `effect.target` | Must be one of: `self`, `leader`, `last`, `all_others` |
| Amount cap (non-set_win_target) | `abs(amount) <= 5` |
| Amount cap (set_win_target) | `5 <= amount <= 30` |
| `max_rules` | `len(state.rules) < settings.max_rules` to add a new amendment. R2 counts. R1/R3 do not (hardcoded). |
| Score floor | All score changes floor at 0 (no negative scores) |
| Board wrap | Positions wrap: `new_pos = ((pos - 1 + movement) % N) + 1` |

### Base rules

| Rule | Representation | Description |
|---|---|---|
| R1 (roll + move) | Hardcoded in engine | The "move" step. Not a rule object. Always executes. |
| R2 (land = +1) | Rule object, `immutable: true` | `trigger: on_land`, `condition: {mode: all, predicates: []}`, `effect: {type: add_score, amount: 1, target: self}` |
| R3 (win check) | Hardcoded in engine | After win_check rules fire, checks `score >= win_target`. Not a rule object. |

### Conflict resolution

Conflict key: `(trigger, effect.type, target)`. Two rules with the same key
conflict.

- Immutable rules (R2): always active, cannot be suppressed.
- Non-immutable rules: only the newest (highest index) is active; older ones
  are suppressed.
- All active rules fire in index order. Effects stack.
- R2 has key `(on_land, add_score, self)` and is immutable. An amendment with
  the same key coexists — both fire. R2 does not participate in any other key.

### Turn execution order

```
1. on_turn_start  — check skip_next first, then fire rules
2. roll dice      — store last_roll
3. on_roll        — fire rules (may adjust movement or reroll)
4. move (R1)      — move by last_roll + adjustments, wrap-around
5. on_land        — fire rules including R2 (+1 score)
6. win_check      — fire rules, then engine checks score >= win_target (R3)
7. finalization   — calculate last_delta, update leaderboard, advance turn
                    (or freeze if finished)
```

- `score_at_turn_start`: acting player's score captured before any effects.
- `last_delta = final_score - score_at_turn_start` (net across entire turn).
- If finished: do NOT increment `turn`, `moves_since_amend`, or advance
  `current_player`.
- If not finished: increment all, advance to next player.
- Skipped turn: increment `turn` only (not `moves_since_amend`), `last_delta = 0`.

### Mode behavior

| Mode | Start phase | Amendment rule |
|---|---|---|
| `draft` | `drafting` | Allowed while `phase == "drafting"`. First roll transitions to `playing` and locks amendments. |
| `live` | `playing` | Allowed when `moves_since_amend >= amend_every`. Counter resets on successful amend. Not allowed before first roll. |
| `hybrid` | `playing` | Always rejected. Random rulebook loaded at game creation. |

---

## 6. How a Validated Court Rule Is Passed to the Engine

Integration flow from amendment text to active rule:

```
1. Client sends POST /game/{id}/amend with {"player_id": "P1", "text": "..."}
2. Server checks can_amend(state):
     - draft: allowed if phase == "drafting"
     - live: allowed if moves_since_amend >= amend_every
     - hybrid: always rejected
3. Server calls compile_amendment(text, state) from backend/court/
4. Court returns {"accepted": bool, "rule": rule|null, "error": str|null}
5. If accepted: server calls validate_rule(rule) from engine.validate
     - Checks trigger, condition, effect structure and constraints
6. If valid: server calls add_amendment(state, rule) from engine.state
     - Validates the rule again (defense in depth)
     - Checks max_rules (len(state.rules) < settings.max_rules)
     - Assigns id: "A1", "A2", ... (based on existing amendment count)
     - Sets immutable = false
     - Appends to state["rules"]
7. Server returns {"accepted": ..., "rule": ..., "error": ..., "state": ...}
```

The Court's output rule must include `trigger`, `condition`, and `effect`.
It may include `source`. It must NOT include `id` or `immutable` — the engine
assigns those.

---

## 7. Examples

### Accepted: simple scoring rule

**Text:** "When you land, gain 2 extra points"

**Court response:**
```json
{
  "accepted": true,
  "rule": {
    "trigger": "on_land",
    "condition": {"mode": "all", "predicates": []},
    "effect": {"type": "add_score", "amount": 2, "target": "self"},
    "source": "When you land, gain 2 extra points"
  },
  "error": null
}
```

**Engine result:** R2 gives +1, amendment gives +2. Acting player gets +3 on
landing. Both fire (R2 is immutable, same conflict key).

### Accepted: conditional rule

**Text:** "When you roll an even number, gain 3 points"

**Court response:**
```json
{
  "accepted": true,
  "rule": {
    "trigger": "on_roll",
    "condition": {"mode": "all", "predicates": [{"name": "roll_is_even"}]},
    "effect": {"type": "add_score", "amount": 3, "target": "self"},
    "source": "When you roll an even number, gain 3 points"
  },
  "error": null
}
```

### Accepted: steal from leader

**Text:** "When you land, steal 2 points from the leader"

**Court response:**
```json
{
  "accepted": true,
  "rule": {
    "trigger": "on_land",
    "condition": {"mode": "all", "predicates": []},
    "effect": {"type": "steal_score", "amount": 2, "target": "leader"},
    "source": "When you land, steal 2 points from the leader"
  },
  "error": null
}
```

### Accepted: change win target

**Text:** "After checking for a winner, set the win target to 15"

**Court response:**
```json
{
  "accepted": true,
  "rule": {
    "trigger": "win_check",
    "condition": {"mode": "all", "predicates": []},
    "effect": {"type": "set_win_target", "amount": 15, "target": "self"},
    "source": "After checking for a winner, set the win target to 15"
  },
  "error": null
}
```

### Rejected: amount exceeds cap

**Court response:**
```json
{
  "accepted": false,
  "rule": null,
  "error": "Effect amount 10 exceeds +/-5 cap"
}
```

### Rejected: invalid trigger

**Court response:**
```json
{
  "accepted": false,
  "rule": null,
  "error": "Invalid trigger: 'on_death'"
}
```

### Rejected: missing required field

**Court response:**
```json
{
  "accepted": false,
  "rule": null,
  "error": "Missing 'effect'"
}
```

---

## 8. Rulebook File Format

JSON files in `rulebooks/`.  Used by hybrid mode (random selection) and by
`GET /rulebooks` (listing).  Validated against `schema/rulebook.schema.json`.

```json
{
  "name": "Chaos Mode",
  "board_sizes": [6, 8],
  "rules": [
    {
      "trigger": "on_roll",
      "condition": {"mode": "all", "predicates": [{"name": "roll_is_even"}]},
      "effect": {"type": "move", "amount": 2, "target": "self"},
      "source": "move 2 extra on even rolls"
    },
    {
      "trigger": "on_land",
      "condition": {"mode": "any", "predicates": [
        {"name": "tile_is_prime"},
        {"name": "is_last"}
      ]},
      "effect": {"type": "steal_score", "amount": 3, "target": "leader"},
      "source": "steal 3 from leader on prime tiles or when last"
    }
  ]
}
```

Rules in rulebook files do not include `id` or `immutable`.  The engine
assigns `id` (A1, A2, ...) and sets `immutable = false` on load.  If
`board_sizes` is absent or empty, the rulebook is compatible with all board
sizes.

---

## 9. API Endpoints

| Method | Path | Request body | Response |
|---|---|---|---|
| POST | `/game/new` | `{"settings": {...}, "players": [{...}]}` | `{"game_id": "...", "state": {...}}` |
| GET | `/game/{id}` | — | `{"state": {...}}` |
| POST | `/game/{id}/roll` | `{"player_id": "P1"}` | `{"state": {...}, "roll": 3}` |
| POST | `/game/{id}/amend` | `{"player_id": "P1", "text": "..."}` | `{"accepted": true, "rule": {...}, "error": null, "state": {...}}` |
| GET | `/rulebooks` | — | `[{"name": "...", "board_sizes": [...], "rules": [...]}]` |

### POST /game/new

Creates a new game.  For hybrid mode, the server reads rulebooks from
`rulebooks/`, selects one compatible with `board_size`, and passes it to
`create_game()`.

### POST /game/{id}/roll

Validates that `player_id` matches the current player.  Calls
`execute_turn(state, random.Random())`.  Returns the updated state and the
dice roll value.

### POST /game/{id}/amend

Checks `can_amend(state)`.  If allowed, calls `compile_amendment(text, state)`
from `backend/court/`.  If the Court accepts and the rule validates, calls
`add_amendment(state, rule)`.  Returns the Court response + updated state.

### GET /rulebooks

Reads all `.json` files from `rulebooks/`.  Validates each against
`schema/rulebook.schema.json`.  Returns the list of valid rulebooks.
