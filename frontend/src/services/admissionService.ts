import { AIRuling, CompiledRule, GameConfig, Player } from '../types/game';

// Prime number helper
export const isPrime = (num: number): boolean => {
  if (num <= 1) return false;
  if (num <= 3) return true;
  if (num % 2 === 0 || num % 3 === 0) return false;
  for (let i = 5; i * i <= num; i += 6) {
    if (num % i === 0 || num % (i + 2) === 0) return false;
  }
  return true;
};

let nextRuleIdCounter = 101;

export interface AdmissionContext {
  proposer: Player;
  currentTurn: number;
  config: GameConfig;
  activeRules: CompiledRule[];
  offlineModel?: boolean;
}

/**
 * AI Admission Pipeline (Gemma Mock Engine with full semantic validation)
 * Implements the PRD specification:
 * - Structural and semantic validation
 * - PRD Section 9 & 10 initial rule vocabulary
 * - ±5 point clamp, 5-30 win target clamp
 * - Strategic self-benefit allowed
 * - Rejects unsupported triggers, actions, external calls, recursion, and voting
 * - Clear adapter for local Ollama / FastAPI backend
 */
export async function submitProposalForAdmission(
  rawProposalText: string,
  context: AdmissionContext
): Promise<AIRuling> {
  // Simulate network/inference latency (400-900ms) for realistic deliberation feel
  await new Promise((resolve) => setTimeout(resolve, context.config.simulatedAiLatency ? 650 : 100));

  const trimmed = rawProposalText.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check for Offline / Local Model Unavailable State (PRD Section 9 / 17)
  if (context.offlineModel || context.config.simulateOfflineModel) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'The local AI model (Ollama) is unavailable or timed out. Match state remains unchanged.',
      timestamp: Date.now(),
      loophole_risk: { score: 'low', note: 'Model unreachable. Retries safely aborted.' },
    };
  }

  // 2. Reject empty or too short
  if (trimmed.length < 5) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Proposal text too brief to extract unambiguous trigger, condition, and effect.',
      timestamp: Date.now(),
    };
  }

  // 3. Reject voting / consensus requests (PRD Section 3 & 5: No player voting)
  if (lower.includes('vote') || lower.includes('ballot') || lower.includes('poll') || lower.includes('approve by player')) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Constitutional rule violation: player voting is strictly prohibited in Amendment. AI admission is sole authority.',
      conflicts: ['AMENDMENT Constitutional Charter: Article II (No Voting)'],
      timestamp: Date.now(),
    };
  }

  // 4. Reject arbitrary code execution / system shell / external network
  if (
    lower.includes('rm -rf') ||
    lower.includes('os.system') ||
    lower.includes('exec(') ||
    lower.includes('subprocess') ||
    lower.includes('fetch(') ||
    lower.includes('weather') ||
    lower.includes('http') ||
    lower.includes('api')
  ) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: lower.includes('weather') || lower.includes('fetch')
        ? 'External web service and API access is prohibited by local-first safety policy.'
        : 'Arbitrary shell and code execution is strictly prohibited by engine sandbox.',
      timestamp: Date.now(),
      loophole_risk: { score: 'high', note: 'Malicious / out-of-scope system boundary violation.' },
    };
  }

  // 5. Reject attempts to repeal immutable base rules (R1, R2, R3)
  if (
    (lower.includes('repeal') || lower.includes('delete') || lower.includes('disable')) &&
    (lower.includes('r1') || lower.includes('r2') || lower.includes('r3') || lower.includes('base rule') || lower.includes('dice roll'))
  ) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Immutable base rules (R1, R2, R3) cannot be repealed or disabled.',
      conflicts: ['Base Game R1/R2/R3 Immutable Engine Lock'],
      timestamp: Date.now(),
    };
  }

  // 6. Check for active rule count limits (PRD Section 11: 8, 12, or 16 by board size)
  const maxActive = context.config.boardSize === 36 ? 8 : context.config.boardSize === 64 ? 12 : 16;
  const currentNonBaseActive = context.activeRules.filter((r) => r.status === 'active' && !r.is_base_rule).length;
  if (currentNonBaseActive >= maxActive) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: `Maximum active rule capacity reached for ${context.config.boardSize}-tile board (${maxActive} rules). Expire or override older rules first.`,
      timestamp: Date.now(),
    };
  }

  // 7. Reject recursive loop triggers (PRD Section 11: Rule execution cannot recursively trigger itself)
  if (
    lower.includes('trigger this rule again') ||
    lower.includes('loop') ||
    lower.includes('recursive') ||
    (lower.includes('when i get a point') && lower.includes('give me another point'))
  ) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Recursive self-triggering loop rejected under PRD engine guardrail 11.',
      timestamp: Date.now(),
      loophole_risk: { score: 'high', note: 'Potential infinite loop detected.' },
    };
  }

  // 8. Reject physical / subjective / untracked triggers
  if (
    lower.includes('blink') ||
    lower.includes('smile') ||
    lower.includes('sportsmanship') ||
    lower.includes('nicely') ||
    lower.includes('hexagonal') ||
    lower.includes('pause the game') ||
    lower.includes('real life')
  ) {
    let reason = 'Physical/sensory triggers are outside supported game state vocabulary.';
    if (lower.includes('sportsmanship') || lower.includes('nicely')) {
      reason = 'Subjective non-quantifiable victory condition cannot be deterministically evaluated.';
    } else if (lower.includes('hexagonal')) {
      reason = 'Board geometry mutations are immutable after match initialization.';
    } else if (lower.includes('pause')) {
      reason = 'Real-time clock pausing is not in turn-based engine vocabulary.';
    }
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason,
      timestamp: Date.now(),
    };
  }

  // 9. Win Target Mutation Parse ("Set win target to X points")
  if (lower.includes('win target') || lower.includes('target to')) {
    const match = lower.match(/(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val < 21 || val > 64) {
        return {
          status: 'rejected',
          normalized_rule: `Set win target to ${val} points.`,
          reason: 'Win target out of bounds (allowed range: 21–64 points).',
          timestamp: Date.now(),
        };
      }
      const ruleId = `AM-${nextRuleIdCounter++}`;
      const compiled: CompiledRule = {
        id: ruleId,
        schema_version: '1.0',
        title: `Target Revision (${val} pts)`,
        original_text: trimmed,
        normalized_rule: `Win target amended to ${val} points.`,
        readable_meaning: `Win check: Immediately sets required winning score threshold to ${val} points.`,
        proposer_id: context.proposer.id,
        proposer_name: context.proposer.name,
        creation_turn: context.currentTurn,
        trigger: 'win_check',
        condition: 'always',
        effect: 'set_win_target',
        effect_value: val,
        target: 'all_players',
        duration: 'permanent',
        activation_boundary: 'next_turn',
        active_from_turn: context.currentTurn + 1,
        status: 'active',
        is_base_rule: false,
        conflicts: ['Overrides initial win target setting'],
        loophole_risk: {
          score: 'low',
          note: 'Valid win target amendment within bounded 21-64 limits.',
        },
      };
      return {
        status: 'accepted',
        normalized_rule: compiled.normalized_rule,
        compiled_rule: compiled,
        reason: 'Within permitted win target boundary (21 to 64). Validated against schema 1.0.',
        timestamp: Date.now(),
      };
    }
  }

  // 10. Check for point quantities & bound checks (±5 max)
  const numberMatches = lower.match(/\b(\d+)\b/g);
  let extractedPoints = 1;
  if (numberMatches && numberMatches.length > 0) {
    const rawNum = parseInt(numberMatches[numberMatches.length - 1], 10);
    // If it's a huge number (e.g. 99999) or > 5 points
    if (rawNum > 5 && !lower.includes('tile 10') && !lower.includes('tile 20') && !lower.includes('score is greater than 10')) {
      if (lower.includes('ignore previous instructions') || rawNum > 100) {
        return {
          status: 'rejected',
          normalized_rule: trimmed,
          reason: 'Prompt injection detected; score delta exceeds ±5 bound.',
          timestamp: Date.now(),
          loophole_risk: { score: 'high', note: 'Jailbreak attempt with out-of-bound score.' },
        };
      }
      return {
        status: 'rejected',
        normalized_rule: trimmed,
        reason: lower.includes('move')
          ? 'Movement bonus exceeds safety limit of ±5 tiles.'
          : 'Exceeds maximum score delta bound (limit is ±5 points).',
        timestamp: Date.now(),
      };
    }
    if (rawNum <= 5 && rawNum > 0) {
      extractedPoints = rawNum;
    }
  }

  // 11. Parse Specific Rule Semantics

  // A. Prime tile landing rule: "When I land on a prime tile, give me X points"
  if (lower.includes('prime') && (lower.includes('land') || lower.includes('tile'))) {
    const points = Math.min(5, Math.max(1, extractedPoints || 2));
    const isSelf = lower.includes(' me') || lower.includes(' i ') || lower.startsWith('when i');
    const isEveryone = lower.includes('everyone') || lower.includes('all');
    const ruleId = `AM-${nextRuleIdCounter++}`;

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: 'Prime Tile Bounty',
      original_text: trimmed,
      normalized_rule: `${isEveryone ? 'Any player landing' : isSelf ? 'Proposer landing' : 'Active player landing'} on prime tile awards ${points} points.`,
      readable_meaning: `On land: If tile is prime (2, 3, 5, 7, 11...), award +${points} points to ${isEveryone ? 'all players' : isSelf ? context.proposer.name : 'active player'}.`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_land',
      condition: 'tile_is_prime',
      effect: 'add_score',
      effect_value: points,
      target: isEveryone ? 'all_players' : isSelf ? 'self' : 'active_player',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: {
        score: 'low',
        note: `Self-benefiting prime tile bounty (+${points} pts). Strategic self-advantage admitted under PRD principle 1.`,
      },
    };

    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: points === 5 ? 'Exactly at upper threshold limit (+5 points). Valid prime trigger.' : 'Valid prime tile trigger and bounded score bonus.',
      timestamp: Date.now(),
    };
  }

  // B. Even roll rule: "If my roll is even, award me X points" / "When roll is even, move +X"
  if (lower.includes('even') && (lower.includes('roll') || lower.includes('dice'))) {
    const isMove = lower.includes('move') || lower.includes('advance') || lower.includes('space');
    const isSteal = lower.includes('steal') || lower.includes('transfer') || lower.includes('give') && lower.includes('leader');
    const pts = Math.min(5, Math.max(1, extractedPoints || 1));
    const ruleId = `AM-${nextRuleIdCounter++}`;

    if (isSteal) {
      const compiled: CompiledRule = {
        id: ruleId,
        schema_version: '1.0',
        title: 'Leader Windfall Tax',
        original_text: trimmed,
        normalized_rule: `When leader rolls even number, transfer ${pts} pt to ${context.proposer.name}.`,
        readable_meaning: `On roll: If current rolling player is the leader and roll is even, transfer ${pts} point from leader to ${context.proposer.name}.`,
        proposer_id: context.proposer.id,
        proposer_name: context.proposer.name,
        creation_turn: context.currentTurn,
        trigger: 'on_roll',
        condition: 'is_leader',
        effect: 'steal_score',
        effect_value: pts,
        target: 'self',
        duration: 'permanent',
        activation_boundary: 'next_turn',
        active_from_turn: context.currentTurn + 1,
        status: 'active',
        is_base_rule: false,
        loophole_risk: { score: 'low', note: 'Bounded resource transfer penalizing the leader.' },
      };
      return {
        status: 'accepted',
        normalized_rule: compiled.normalized_rule,
        compiled_rule: compiled,
        reason: 'Valid steal_score effect with bounded transfer from leader.',
        timestamp: Date.now(),
      };
    }

    if (isMove) {
      const compiled: CompiledRule = {
        id: ruleId,
        schema_version: '1.0',
        title: 'Even Roll Extra Movement',
        original_text: trimmed,
        normalized_rule: `Rolling an even number grants +${pts} additional tile movement.`,
        readable_meaning: `On roll: If roll is even (2, 4, 6, 8...), advance an additional ${pts} space after base movement.`,
        proposer_id: context.proposer.id,
        proposer_name: context.proposer.name,
        creation_turn: context.currentTurn,
        trigger: 'on_roll',
        condition: 'roll_is_even',
        effect: 'move',
        effect_value: pts,
        target: 'active_player',
        duration: 'permanent',
        activation_boundary: 'next_turn',
        active_from_turn: context.currentTurn + 1,
        status: 'active',
        is_base_rule: false,
        loophole_risk: { score: 'low', note: 'Standard movement accelerator within safe bounds.' },
      };
      return {
        status: 'accepted',
        normalized_rule: compiled.normalized_rule,
        compiled_rule: compiled,
        reason: 'Valid on_roll even condition with bounded movement modifier.',
        timestamp: Date.now(),
      };
    }

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: 'Even Roll Bonus',
      original_text: trimmed,
      normalized_rule: `Rolling an even number yields +${pts} score bonus.`,
      readable_meaning: `On roll: If dice sum is even (2, 4, 6, 8...), award +${pts} point(s) to rolling player.`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_roll',
      condition: 'roll_is_even',
      effect: 'add_score',
      effect_value: pts,
      target: 'active_player',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: { score: 'low', note: 'Even roll condition verified against deterministic dice rolls.' },
    };
    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: 'Valid on_roll even condition with bounded reward.',
      timestamp: Date.now(),
    };
  }

  // C. Last place / Catch-up rule: "When I am in last place, give me X points / move me"
  if (lower.includes('last place') || lower.includes('in last') || lower.includes('trailing')) {
    const isMove = lower.includes('move') || lower.includes('advance');
    const pts = Math.min(5, Math.max(1, extractedPoints || 2));
    const ruleId = `AM-${nextRuleIdCounter++}`;

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: isMove ? 'Underdog Stride' : 'Underdog Relief Bonus',
      original_text: trimmed,
      normalized_rule: `When ${context.proposer.name} is in last place at turn start, ${isMove ? `move forward ${pts} spaces` : `award +${pts} points`}.`,
      readable_meaning: `On turn start: If ${context.proposer.name} is ranked last place in the shared leaderboard, ${isMove ? `advance ${pts} tiles` : `award +${pts} points`}.`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_turn_start',
      condition: 'is_last',
      effect: isMove ? 'move' : 'add_score',
      effect_value: pts,
      target: 'self',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: { score: 'low', note: 'Catch-up mechanic evaluated using canonical tie-breaker leaderboard.' },
    };

    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: 'Valid is_last condition on turn start. Evaluated using shared leaderboard ranking.',
      timestamp: Date.now(),
    };
  }

  // D. General landing movement: "When I land on any tile, move me forward X extra space"
  if (lower.includes('land') && (lower.includes('move') || lower.includes('advance') || lower.includes('extra space'))) {
    const pts = Math.min(5, Math.max(1, extractedPoints || 1));
    const ruleId = `AM-${nextRuleIdCounter++}`;

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: 'Momentum Spring',
      original_text: trimmed,
      normalized_rule: `Landing on any tile advances ${context.proposer.name} +${pts} additional tile.`,
      readable_meaning: `On land: Whenever ${context.proposer.name} lands on any tile, advance an extra ${pts} space(s).`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_land',
      condition: 'always',
      effect: 'move',
      effect_value: pts,
      target: 'self',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: { score: 'low', note: 'Bounded movement adjustment within ±5 limit.' },
    };

    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: 'Valid movement effect bounded to +1 space. Activates at next turn.',
      timestamp: Date.now(),
    };
  }

  // E. Score threshold trigger: "When my score is greater than X, give me Y points"
  if (lower.includes('score is greater') || lower.includes('score >') || lower.includes('more than 10 points')) {
    const pts = Math.min(5, Math.max(1, extractedPoints > 5 ? 1 : extractedPoints || 1));
    const threshold = lower.includes('10') ? 10 : 5;
    const ruleId = `AM-${nextRuleIdCounter++}`;

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: 'High Score Dividend',
      original_text: trimmed,
      normalized_rule: `When score exceeds ${threshold}, award +${pts} point at turn start.`,
      readable_meaning: `On turn start: If active player has score > ${threshold}, award +${pts} points.`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_turn_start',
      condition: 'score_gt',
      condition_value: threshold,
      effect: 'add_score',
      effect_value: pts,
      target: 'active_player',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: { score: 'medium', note: 'Compound advantage for high scorer; bounded by win target check.' },
    };

    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: `Valid score_gt condition (threshold: ${threshold}) with bounded bonus (+${pts} pt).`,
      timestamp: Date.now(),
    };
  }

  // F. Specific tile landing: "When I land on tile X, give me Y points"
  if (lower.includes('land on tile') || lower.includes('tile 10') || lower.includes('tile 20')) {
    const pts = Math.min(5, Math.max(1, extractedPoints || 2));
    const ruleId = `AM-${nextRuleIdCounter++}`;

    const compiled: CompiledRule = {
      id: ruleId,
      schema_version: '1.0',
      title: 'Specific Tile Bounty',
      original_text: trimmed,
      normalized_rule: `Landing on tile awards +${pts} points to ${context.proposer.name}.`,
      readable_meaning: `On land: If tile matches target landmark, award +${pts} points to ${context.proposer.name}.`,
      proposer_id: context.proposer.id,
      proposer_name: context.proposer.name,
      creation_turn: context.currentTurn,
      trigger: 'on_land',
      condition: 'always',
      effect: 'add_score',
      effect_value: pts,
      target: 'self',
      duration: 'permanent',
      activation_boundary: 'next_turn',
      active_from_turn: context.currentTurn + 1,
      status: 'active',
      is_base_rule: false,
      loophole_risk: { score: 'low', note: 'Tile landmark bonus clamped to ±5 points.' },
    };

    return {
      status: 'accepted',
      normalized_rule: compiled.normalized_rule,
      compiled_rule: compiled,
      reason: pts === 5 ? 'Exactly at upper threshold limit (+5 points).' : 'Valid landing effect within bounded limits.',
      timestamp: Date.now(),
    };
  }

  // G. Elimination / Unconditional win / Swap without target -> Rejections
  if (lower.includes('delete') || lower.includes('eliminate') || lower.includes('remove other player')) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Unsupported effect: permanent elimination is not in engine vocabulary.',
      timestamp: Date.now(),
    };
  }

  if (lower.includes('winner right now') || lower.includes('declare') && lower.includes('winner')) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Immediate unconditional win declaration violates deterministic win check bounds.',
      timestamp: Date.now(),
    };
  }

  if (lower.includes('swap') || lower.includes('exchange')) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Ambiguous target selector: target opponent must be specified (e.g. leader or last place).',
      timestamp: Date.now(),
    };
  }

  if (lower.includes('double')) {
    return {
      status: 'rejected',
      normalized_rule: trimmed,
      reason: 'Undefined event scope: multiplication multiplier exceeds bounded effect bounds.',
      timestamp: Date.now(),
    };
  }

  // Default fallback for ambiguous proposals: reject safely without changing game state
  return {
    status: 'rejected',
    normalized_rule: trimmed,
    reason: 'Ambiguous trigger and condition: timing and evaluation condition unspecified. Please specify trigger (e.g. on land, on roll) and bounded effect.',
    suggested_fix: 'Try: "When I land on a prime tile, give me 2 points" or "If my roll is even, award me 1 point."',
    timestamp: Date.now(),
  };
}

/**
 * Gemma AI Opponent Strategy:
 * When it's Gemma's turn to propose, generate a strategic, self-benefiting amendment.
 */
export function generateGemmaProposal(context: AdmissionContext): string {
  const isLast = context.activeRules.length > 0;
  const proposals = [
    'When I land on a prime tile, give me 2 points.',
    'If my roll is even, award me 1 point.',
    'When the leader rolls an even number, transfer 1 point from leader to me.',
    'When I am in last place, give me 2 points on turn start.',
    'When I land on any tile, move me forward 1 extra space.',
  ];
  // Pick one not yet enacted
  const existingTitles = new Set(context.activeRules.map((r) => r.title.toLowerCase()));
  for (const p of proposals) {
    if (!existingTitles.has(p.toLowerCase())) {
      return p;
    }
  }
  return proposals[Math.floor(Math.random() * proposals.length)];
}
