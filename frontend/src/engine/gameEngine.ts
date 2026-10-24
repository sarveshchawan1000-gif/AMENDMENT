import {
  CompiledRule,
  DiceType,
  GameEventLog,
  GameState,
  Player,
  RuleFiredSummary,
} from '../types/game';
import { isPrime } from '../services/admissionService';

/**
 * Deterministic Ranking Function (PRD Section 11:
 * "The same ranking function must power leaderboard order and predicates such as is_leader and is_last.")
 *
 * Tie-break rule:
 * 1. Score descending
 * 2. Position descending (further along the board)
 * 3. Total amendments passed descending
 * 4. Stable Player ID order
 */
export function rankPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.position !== a.position) return b.position - a.position;
    if (b.totalAmendmentsPassed !== a.totalAmendmentsPassed) {
      return b.totalAmendmentsPassed - a.totalAmendmentsPassed;
    }
    return a.id.localeCompare(b.id);
  });
}

export function getLeader(players: Player[]): Player {
  return rankPlayers(players)[0];
}

export function getLastPlace(players: Player[]): Player {
  const ranked = rankPlayers(players);
  return ranked[ranked.length - 1];
}

/**
 * Roll dice deterministically within dice type bounds
 */
export function rollDice(diceType: DiceType): { rollTotal: number; diceValues: number[] } {
  switch (diceType) {
    case '1d6': {
      const val = Math.floor(Math.random() * 6) + 1;
      return { rollTotal: val, diceValues: [val] };
    }
    case '2d6': {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      return { rollTotal: d1 + d2, diceValues: [d1, d2] };
    }
    case '1d12': {
      const val = Math.floor(Math.random() * 12) + 1;
      return { rollTotal: val, diceValues: [val] };
    }
    default:
      return { rollTotal: 3, diceValues: [3] };
  }
}

/**
 * Checks if a rule's condition is met for the current context
 */
function evaluateCondition(
  rule: CompiledRule,
  activePlayer: Player,
  players: Player[],
  rollValue: number | null,
  tileIndex: number | null
): boolean {
  switch (rule.condition) {
    case 'always':
      return true;
    case 'is_leader': {
      const leader = getLeader(players);
      return activePlayer.id === leader.id;
    }
    case 'is_last': {
      const last = getLastPlace(players);
      return activePlayer.id === last.id;
    }
    case 'roll_is_even': {
      if (rollValue === null) return false;
      return rollValue % 2 === 0;
    }
    case 'tile_is_prime': {
      if (tileIndex === null) return false;
      return isPrime(tileIndex);
    }
    case 'score_gt': {
      const threshold = rule.condition_value ?? 0;
      return activePlayer.score > threshold;
    }
    default:
      return false;
  }
}

/**
 * Resolve target player(s) for a rule effect
 */
function resolveTargets(
  rule: CompiledRule,
  activePlayer: Player,
  players: Player[]
): Player[] {
  switch (rule.target) {
    case 'self': {
      const proposer = players.find((p) => p.id === rule.proposer_id);
      return proposer ? [proposer] : [activePlayer];
    }
    case 'active_player':
      return [activePlayer];
    case 'leader':
      return [getLeader(players)];
    case 'last_place':
      return [getLastPlace(players)];
    case 'all_players':
      return [...players];
    case 'opponents':
      return players.filter((p) => p.id !== activePlayer.id);
    default:
      return [activePlayer];
  }
}

export interface EngineTurnResult {
  nextState: GameState;
  eventsGenerated: GameEventLog[];
}

/**
 * The Deterministic Engine Turn Execution Pipeline
 * Implements PRD Section 11 sequence:
 * 1. Turn-start effects
 * 2. Roll generation
 * 3. Roll effects
 * 4. Movement effects and movement
 * 5. Landing effects
 * 6. Score and ranking recomputation
 * 7. Win check
 */
export function executePlayerRollAndMove(
  currentState: GameState,
  presetRoll?: number
): EngineTurnResult {
  const events: GameEventLog[] = [];
  let players = currentState.players.map((p) => ({ ...p }));
  let rules = currentState.rules.map((r) => ({ ...r }));
  const activePlayer = players[currentState.activePlayerIndex];
  const boardSize = currentState.config.boardSize;
  let winTarget = currentState.config.winTarget;

  // Find win target override if any active
  const targetRule = rules.find(
    (r) => r.status === 'active' && r.effect === 'set_win_target' && r.active_from_turn <= currentState.turnCount
  );
  if (targetRule) {
    winTarget = targetRule.effect_value;
  }

  // --- STEP 1: Turn-start effects ---
  const turnStartFired: RuleFiredSummary[] = [];
  const activeTurnStartRules = rules.filter(
    (r) => r.status === 'active' && r.trigger === 'on_turn_start' && r.active_from_turn <= currentState.turnCount
  );

  for (const rule of activeTurnStartRules) {
    if (evaluateCondition(rule, activePlayer, players, null, activePlayer.position)) {
      const targets = resolveTargets(rule, activePlayer, players);
      for (const t of targets) {
        const targetIdx = players.findIndex((p) => p.id === t.id);
        if (targetIdx !== -1) {
          if (rule.effect === 'add_score') {
            const delta = Math.max(-5, Math.min(5, rule.effect_value));
            players[targetIdx].score = Math.max(0, players[targetIdx].score + delta);
            turnStartFired.push({
              rule_id: rule.id,
              rule_title: rule.title,
              is_base_rule: rule.is_base_rule,
              effect_summary: `Turn-start effect: +${delta} points to ${players[targetIdx].name}`,
              score_delta: delta,
              target_player_id: players[targetIdx].id,
            });
          } else if (rule.effect === 'move') {
            const mDelta = Math.max(-5, Math.min(5, rule.effect_value));
            let newPos = ((players[targetIdx].position - 1 + mDelta) % boardSize) + 1;
            if (newPos <= 0) newPos += boardSize;
            players[targetIdx].position = newPos;
            turnStartFired.push({
              rule_id: rule.id,
              rule_title: rule.title,
              is_base_rule: rule.is_base_rule,
              effect_summary: `Turn-start movement: advanced ${mDelta} spaces to tile ${newPos}`,
              position_delta: mDelta,
              target_player_id: players[targetIdx].id,
            });
          }
        }
      }
    }
  }

  if (turnStartFired.length > 0) {
    events.push({
      id: `evt-ts-${Date.now()}-${Math.random()}`,
      turn: currentState.turnCount,
      player_id: activePlayer.id,
      player_name: activePlayer.name,
      player_color: activePlayer.color,
      phase: 'turn_start',
      description: `${activePlayer.name} experienced turn-start amendments: ${turnStartFired.map((f) => f.effect_summary).join('; ')}`,
      prior_score: activePlayer.score,
      resulting_score: activePlayer.score,
      score_delta: turnStartFired.reduce((acc, f) => acc + (f.score_delta || 0), 0),
      prior_position: activePlayer.position,
      resulting_position: activePlayer.position,
      rules_fired: turnStartFired,
      timestamp: Date.now(),
    });
  }

  // --- STEP 2: Roll generation ---
  const rollRes = presetRoll !== undefined
    ? { rollTotal: presetRoll, diceValues: [presetRoll] }
    : rollDice(currentState.config.dice);
  const diceTotal = rollRes.rollTotal;

  // --- STEP 3: Roll effects ---
  const rollFired: RuleFiredSummary[] = [];
  const activeRollRules = rules.filter(
    (r) => r.status === 'active' && r.trigger === 'on_roll' && r.active_from_turn <= currentState.turnCount
  );

  let extraMovementFromRoll = 0;

  for (const rule of activeRollRules) {
    if (evaluateCondition(rule, activePlayer, players, diceTotal, activePlayer.position)) {
      if (rule.effect === 'add_score') {
        const delta = Math.max(-5, Math.min(5, rule.effect_value));
        const targets = resolveTargets(rule, activePlayer, players);
        for (const t of targets) {
          const tIdx = players.findIndex((p) => p.id === t.id);
          if (tIdx !== -1) {
            players[tIdx].score = Math.max(0, players[tIdx].score + delta);
            rollFired.push({
              rule_id: rule.id,
              rule_title: rule.title,
              is_base_rule: rule.is_base_rule,
              effect_summary: `${rule.title}: +${delta} pts to ${players[tIdx].name}`,
              score_delta: delta,
              target_player_id: players[tIdx].id,
            });
          }
        }
      } else if (rule.effect === 'move') {
        const mDelta = Math.max(-5, Math.min(5, rule.effect_value));
        extraMovementFromRoll += mDelta;
        rollFired.push({
          rule_id: rule.id,
          rule_title: rule.title,
          is_base_rule: rule.is_base_rule,
          effect_summary: `${rule.title}: grants +${mDelta} extra move`,
          position_delta: mDelta,
          target_player_id: activePlayer.id,
        });
      } else if (rule.effect === 'steal_score') {
        const stealVal = Math.max(1, Math.min(5, rule.effect_value));
        const leader = getLeader(players);
        const beneficiary = rule.target === 'self'
          ? (players.find((p) => p.id === rule.proposer_id) || activePlayer)
          : getLastPlace(players);

        if (leader.id !== beneficiary.id && leader.score > 0) {
          const actualStolen = Math.min(leader.score, stealVal);
          const lIdx = players.findIndex((p) => p.id === leader.id);
          const bIdx = players.findIndex((p) => p.id === beneficiary.id);
          if (lIdx !== -1 && bIdx !== -1) {
            players[lIdx].score -= actualStolen;
            players[bIdx].score += actualStolen;
            rollFired.push({
              rule_id: rule.id,
              rule_title: rule.title,
              is_base_rule: rule.is_base_rule,
              effect_summary: `${rule.title}: transferred ${actualStolen} pt(s) from leader (${leader.name}) to ${beneficiary.name}`,
              score_delta: actualStolen,
              target_player_id: beneficiary.id,
            });
          }
        }
      }
    }
  }

  // --- STEP 4: Movement and base roll (R1) ---
  const startPos = activePlayer.position;
  const totalMove = diceTotal + extraMovementFromRoll;
  let endPos = ((startPos - 1 + totalMove) % boardSize) + 1;
  if (endPos <= 0) endPos += boardSize;

  const playerIdx = currentState.activePlayerIndex;
  players[playerIdx].position = endPos;

  // Record roll and move event
  events.push({
    id: `evt-roll-${Date.now()}-${Math.random()}`,
    turn: currentState.turnCount,
    player_id: activePlayer.id,
    player_name: activePlayer.name,
    player_color: activePlayer.color,
    phase: 'roll',
    description: `${activePlayer.name} rolled ${diceTotal}${extraMovementFromRoll !== 0 ? ` (+${extraMovementFromRoll} rule bonus)` : ''} and moved from tile ${startPos} to tile ${endPos}.`,
    dice_roll: diceTotal,
    dice_type: currentState.config.dice,
    start_pos: startPos,
    end_pos: endPos,
    prior_score: activePlayer.score,
    resulting_score: players[playerIdx].score,
    score_delta: rollFired.reduce((acc, f) => acc + (f.score_delta || 0), 0),
    prior_position: startPos,
    resulting_position: endPos,
    rules_fired: [
      {
        rule_id: 'R1',
        rule_title: 'Roll and Move',
        is_base_rule: true,
        effect_summary: `Base rule R1: advanced ${diceTotal} spaces`,
        position_delta: diceTotal,
      },
      ...rollFired,
    ],
    timestamp: Date.now(),
  });

  // --- STEP 5: Landing effects (R2 + on_land rules) ---
  const landingFired: RuleFiredSummary[] = [];
  const priorScoreBeforeLanding = players[playerIdx].score;

  // Constitutional Base Rule R2: Landing score (+1 point)
  let baseLandingScore = 1;
  players[playerIdx].score += baseLandingScore;
  landingFired.push({
    rule_id: 'R2',
    rule_title: 'Landing Score',
    is_base_rule: true,
    effect_summary: 'Constitutional Base Rule R2: +1 point for landing on a tile',
    score_delta: 1,
    target_player_id: activePlayer.id,
  });

  // Evaluate active on_land amendments
  const activeLandingRules = rules.filter(
    (r) => r.status === 'active' && r.trigger === 'on_land' && r.active_from_turn <= currentState.turnCount
  );

  for (const rule of activeLandingRules) {
    if (evaluateCondition(rule, players[playerIdx], players, diceTotal, endPos)) {
      if (rule.effect === 'add_score') {
        const delta = Math.max(-5, Math.min(5, rule.effect_value));
        const targets = resolveTargets(rule, players[playerIdx], players);
        for (const t of targets) {
          const tIdx = players.findIndex((p) => p.id === t.id);
          if (tIdx !== -1) {
            players[tIdx].score = Math.max(0, players[tIdx].score + delta);
            landingFired.push({
              rule_id: rule.id,
              rule_title: rule.title,
              is_base_rule: rule.is_base_rule,
              effect_summary: `${rule.title}: +${delta} points to ${players[tIdx].name}`,
              score_delta: delta,
              target_player_id: players[tIdx].id,
            });
          }
        }
      } else if (rule.effect === 'move') {
        const mDelta = Math.max(-5, Math.min(5, rule.effect_value));
        let springPos = ((players[playerIdx].position - 1 + mDelta) % boardSize) + 1;
        if (springPos <= 0) springPos += boardSize;
        players[playerIdx].position = springPos;
        landingFired.push({
          rule_id: rule.id,
          rule_title: rule.title,
          is_base_rule: rule.is_base_rule,
          effect_summary: `${rule.title}: spring movement advanced to tile ${springPos}`,
          position_delta: mDelta,
          target_player_id: activePlayer.id,
        });
      }
    }
  }

  const landingScoreDelta = players[playerIdx].score - priorScoreBeforeLanding;

  events.push({
    id: `evt-land-${Date.now()}-${Math.random()}`,
    turn: currentState.turnCount,
    player_id: activePlayer.id,
    player_name: activePlayer.name,
    player_color: activePlayer.color,
    phase: 'landing',
    description: `${activePlayer.name} landed on tile ${endPos}${isPrime(endPos) ? ' (Prime Tile ★)' : ''}, earning ${landingScoreDelta} pt(s).`,
    start_pos: startPos,
    end_pos: players[playerIdx].position,
    prior_score: priorScoreBeforeLanding,
    resulting_score: players[playerIdx].score,
    score_delta: landingScoreDelta,
    prior_position: endPos,
    resulting_position: players[playerIdx].position,
    rules_fired: landingFired,
    timestamp: Date.now(),
  });

  // --- STEP 6: Score and ranking recomputation ---
  const ranked = rankPlayers(players);

  // --- STEP 7: Win check (R3) ---
  let winner: Player | null = null;
  const potentialWinners = ranked.filter((p) => p.score >= winTarget);
  if (potentialWinners.length > 0) {
    // Top ranked player meeting target wins (canonical tie-break)
    winner = potentialWinners[0];
    events.push({
      id: `evt-win-${Date.now()}-${Math.random()}`,
      turn: currentState.turnCount,
      player_id: winner.id,
      player_name: winner.name,
      player_color: winner.color,
      phase: 'win_check',
      description: `VICTORY! ${winner.name} achieved the win target of ${winTarget} points (Final Score: ${winner.score}).`,
      prior_score: winner.score,
      resulting_score: winner.score,
      score_delta: 0,
      prior_position: winner.position,
      resulting_position: winner.position,
      rules_fired: [
        {
          rule_id: 'R3',
          rule_title: 'Win Check',
          is_base_rule: true,
          effect_summary: `Constitutional Base Rule R3: verified winning threshold (${winTarget} pts)`,
        },
      ],
      timestamp: Date.now(),
    });
  }

  // --- Per-player move counter ---
  // Increment this player's personal move count (used for per-player cadence).
  const updatedMoveCounts: Record<string, number> = {
    ...currentState.playerMoveCounts,
    [activePlayer.id]: (currentState.playerMoveCounts[activePlayer.id] ?? 0) + 1,
  };
  const thisPlayerMoveCount = updatedMoveCounts[activePlayer.id];

  // Determine whether this turn permits a proposal.
  // Cadence is checked PER-PLAYER (every N personal moves),
  // not globally, so every player gets equal proposal opportunities
  // regardless of how many players are in the game.
  const isCadenceEligible =
    currentState.config.mode === 'live' &&
    !winner &&
    thisPlayerMoveCount % currentState.config.amendmentCadenceMoves === 0;

  const nextPhase = winner
    ? 'game_over'
    : isCadenceEligible
    ? 'eligible_for_amendment'
    : 'waiting_for_roll';

  const nextActiveIndex = isCadenceEligible
    ? currentState.activePlayerIndex
    : (currentState.activePlayerIndex + 1) % players.length;

  const nextTurnCount = isCadenceEligible
    ? currentState.turnCount
    : currentState.turnCount + 1;

  return {
    nextState: {
      ...currentState,
      players,
      rules,
      events: [...currentState.events, ...events],
      winner,
      turnCount: nextTurnCount,
      activePlayerIndex: nextActiveIndex,
      currentDiceRoll: diceTotal,
      phase: nextPhase,
      playerMoveCounts: updatedMoveCounts,
    },
    eventsGenerated: events,
  };
}

/**
 * Advance turn after amendment has been accepted, rejected, or skipped
 */
export function advanceTurnAfterAmendment(currentState: GameState): GameState {
  const nextActiveIndex = (currentState.activePlayerIndex + 1) % currentState.players.length;
  const nextTurnCount = currentState.turnCount + 1;

  // Activate any rules that had activation_boundary 'next_turn' scheduled for this turn
  const updatedRules = currentState.rules.map((r) => {
    if (r.status === 'pending' && r.active_from_turn <= nextTurnCount) {
      return { ...r, status: 'active' as const };
    }
    return r;
  });

  return {
    ...currentState,
    rules: updatedRules,
    turnCount: nextTurnCount,
    activePlayerIndex: nextActiveIndex,
    phase: 'waiting_for_roll',
    currentDiceRoll: null,
  };
}
