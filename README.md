# AMENDMENT: The Board Game That Rewrites Its Own Rules

A local-first multiplayer strategy board game where players move around a board, earn points, and write plain-English rules to rewrite the game in their strategic favor.

- **No Player Voting**: Strategic self-benefit is allowed and encouraged; the AI judicial pipeline is the sole admission authority.
- **Bounded Language**: Natural language proposals map strictly into a bounded trigger/condition/effect vocabulary.
- **Deterministic Play**: Executed by a pure, deterministic engine with strict limits ($\pm5$ points max, win target 5–30, loop guardrails, canonical tie-breaking).
- **Auditable Outcomes**: The **Rule Ledger** displays the original English proposal side-by-side with its compiled engine law; the **Rule Autopsy** details exactly which rules caused every state change.

---

## Quick Start

### Prerequisites
- Node.js (v18+) and npm

### Run the Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` in your web browser.

---

## Game Screens & Features

1. **Setup Screen**
   - **Board Dimensions**: 36 tiles (Fast 6x6), 64 tiles (Classic 8x8), or 100 tiles (Grand 10x10).
   - **Dice Configuration**: 1d6 (1–6), 2d6 (2–12), or 1d12 (1–12).
   - **Points to Win**: Configurable target between 5 and 30 points.
   - **Rule Modes**:
     - **Live Mode**: Core loop. Proposal window opens after each player move on the configured cadence.
     - **Draft Mode**: Players submit proposed rules before the first roll to construct the match rulebook.
     - **Hybrid Mode**: Curated rulebooks bundled from the library (*Prime Tax & Accords*, *The Catch-Up Doctrine*, *High Roller's Charter*) with preview and reroll controls.
   - **Theme**: Parchment Light or Chamber Dark theme.
   - **Gemma Bot Opponent**: Autonomous AI player that rolls and proposes strategic self-benefiting rules.
   - **Model Readiness & Offline Simulation**: Toggle to demonstrate offline fallback handling when local Ollama is unreachable.

2. **Assembly Floor (Board)**
   - Boustrophedon snake-path grid with numbered tiles.
   - Prime-numbered tiles (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31...) marked with golden laurels (★).
   - Animated tokens with player avatar, ring highlight, and multi-player tile stacking.

3. **Rule Ledger**
   - Always-visible legal ledger displaying the three constitutional base rules:
     - `R1`: Roll and Move
     - `R2`: Landing Score (+1 pt standard)
     - `R3`: Win Check
   - Enacted amendments display:
     - Authored English proposal beside normalized compiled engine law.
     - Proposer, activation timing (e.g. next-turn boundary), duration, and status stamps.
     - Filter tabs: **Active**, **All**, **Expired**, **Rejected**, **Superceded**.
     - Secondary "Inspect Compiled JSON" modal.

4. **Proposal Composer & AI Judicial Ruling**
   - Free-form text proposal with starter suggestion chips and 140-character limit.
   - Animated judicial deliberation state.
   - **`✓ ADMITTED`** green emerald stamp with normalized meaning and next-turn boundary enforcement note.
   - **`✕ REJECTED`** crimson stamp with explicit grounds and confirmation that match state remained unaltered.

5. **Rule Autopsy / Causal Record**
   - Clicking any event in the Proceedings Log opens forensic autopsy details.
   - Displays prior score $\rightarrow$ resulting score, prior tile $\rightarrow$ resulting tile, and exact breakdown of base-game vs amendment contributions.

6. **25-Amendment Evaluation Harness (PRD §18)**
   - Interactive modal running 25 frozen test cases covering valid self-benefit, catch-up, boundary values, unsupported actions, ambiguous phrasing, and adversarial/loop injections.
   - Verifies 100% schema compliance and 0 unsafe engine executions.

7. **Export & Persistence**
   - Export match rule set as a validated JSON rulebook at any point.

---

## Architectural Separation & Integration Points

The codebase cleanly separates UI, engine, and AI services:

- `frontend/src/engine/gameEngine.ts`: Pure, deterministic engine. Implements the canonical ranking function, tie-breaker policy, turn order sequence (`turn_start` $\rightarrow$ `roll` $\rightarrow$ `movement` $\rightarrow$ `landing` $\rightarrow$ `ranking` $\rightarrow$ `win_check`), and event audit log generation.
- `frontend/src/services/admissionService.ts`: AI admission interface. Currently implements realistic parsing, bounded semantic validation, and offline fallbacks.
  - **Backend Integration Point**: To connect to a live FastAPI server running local Gemma via Ollama, replace the mock handler in `submitProposalForAdmission` with a call to `POST /api/propose`.
- `rulebooks/`: Pre-bundled curated rule sets (*Prime Tax Accords*, *The Catch-Up Doctrine*).
