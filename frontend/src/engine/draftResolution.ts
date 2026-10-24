import { BoardSize, CompiledRule } from '../types/game';

export type DraftResolutionStatus =
  | 'accepted'
  | 'removed-conflict'
  | 'removed-duplicate'
  | 'removed-ledger-full';

export interface AcceptedDraftRule {
  lineNumber: number;
  rule: CompiledRule;
}

export interface DraftResolutionEvaluation {
  status: DraftResolutionStatus;
  reason: string;
  conflictingLineNumber?: number;
}

/**
 * Returns the maximum number of active rules kept on the ledger
 * based on the selected board dimension.
 */
export function getLedgerLimit(boardSize: BoardSize): number {
  switch (boardSize) {
    case 36:
      return 8;
    case 64:
      return 12;
    case 100:
      return 16;
    default:
      return 8;
  }
}

/**
 * Normalizes rule strings for whitespace/case comparison.
 */
function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Deterministically checks if two compiled rules are identical in definition.
 */
export function isDuplicateRule(a: CompiledRule, b: CompiledRule): boolean {
  if (
    a.normalized_rule &&
    b.normalized_rule &&
    normalizeText(a.normalized_rule) === normalizeText(b.normalized_rule)
  ) {
    return true;
  }

  const sameTrigger = a.trigger === b.trigger;
  const sameCondition = a.condition === b.condition;
  const sameConditionVal = (a.condition_value ?? null) === (b.condition_value ?? null);
  const sameEffect = a.effect === b.effect;
  const sameEffectVal = a.effect_value === b.effect_value;
  const sameTarget = a.target === b.target;

  return (
    sameTrigger &&
    sameCondition &&
    sameConditionVal &&
    sameEffect &&
    sameEffectVal &&
    sameTarget
  );
}

/**
 * Deterministically checks if two rules collide:
 * - Two set_win_target rules.
 * - Same trigger + subject/condition + target with opposite, contradictory, or stacking parameters.
 */
export function findRuleConflict(
  candidate: CompiledRule,
  acceptedRule: CompiledRule
): { hasConflict: boolean; reason?: string } {
  // 1. Double win target rule conflict
  if (candidate.effect === 'set_win_target' && acceptedRule.effect === 'set_win_target') {
    return {
      hasConflict: true,
      reason: 'Multiple win target rules are not permitted; only the first ratified target stands.',
    };
  }

  // Check matching scope: trigger, target, and condition
  const sameTrigger = candidate.trigger === acceptedRule.trigger;
  const sameTarget = candidate.target === acceptedRule.target;
  const sameCondition =
    candidate.condition === acceptedRule.condition &&
    (candidate.condition_value ?? null) === (acceptedRule.condition_value ?? null);

  if (sameTrigger && sameTarget && sameCondition) {
    // A. Opposite or conflicting score effects (+ vs -)
    if (candidate.effect === 'add_score' && acceptedRule.effect === 'add_score') {
      const aVal = acceptedRule.effect_value;
      const bVal = candidate.effect_value;
      if ((aVal > 0 && bVal < 0) || (aVal < 0 && bVal > 0)) {
        return {
          hasConflict: true,
          reason: `Contradictory score direction (${aVal > 0 ? '+' : ''}${aVal} vs ${bVal > 0 ? '+' : ''}${bVal}) on ${candidate.trigger}.`,
        };
      }
      // Stacking parameter collision
      if (aVal !== bVal) {
        return {
          hasConflict: true,
          reason: `Conflicting score modifier amount (${aVal} vs ${bVal}) on ${candidate.trigger}.`,
        };
      }
    }

    // B. add_score vs steal_score collision
    if (
      (candidate.effect === 'add_score' && acceptedRule.effect === 'steal_score') ||
      (candidate.effect === 'steal_score' && acceptedRule.effect === 'add_score')
    ) {
      return {
        hasConflict: true,
        reason: `Conflicting score mechanism (add vs steal) on ${candidate.trigger}.`,
      };
    }

    // C. Contradictory movement directions
    if (candidate.effect === 'move' && acceptedRule.effect === 'move') {
      const aVal = acceptedRule.effect_value;
      const bVal = candidate.effect_value;
      if ((aVal > 0 && bVal < 0) || (aVal < 0 && bVal > 0)) {
        return {
          hasConflict: true,
          reason: `Contradictory movement directions (${aVal > 0 ? '+' : ''}${aVal} vs ${bVal > 0 ? '+' : ''}${bVal}) on ${candidate.trigger}.`,
        };
      }
      if (aVal !== bVal) {
        return {
          hasConflict: true,
          reason: `Conflicting movement bonus (${aVal} vs ${bVal}) on ${candidate.trigger}.`,
        };
      }
    }

    // D. Incompatible turn execution actions (e.g. skip_turn vs reroll)
    const turnActions = ['skip_turn', 'reroll'];
    if (
      (turnActions.includes(candidate.effect) && turnActions.includes(acceptedRule.effect)) &&
      candidate.effect !== acceptedRule.effect
    ) {
      return {
        hasConflict: true,
        reason: `Incompatible turn action (${acceptedRule.effect} vs ${candidate.effect}) on ${candidate.trigger}.`,
      };
    }
  }

  return { hasConflict: false };
}

/**
 * Pure, deterministic evaluation of a candidate compiled rule against already accepted rules.
 * Enforces:
 * 1. Duplicate detection -> removed-duplicate
 * 2. Conflict detection (set_win_target pairs, opposite/contradictory effects) -> removed-conflict
 * 3. Ledger capacity -> removed-ledger-full
 * 4. Otherwise -> accepted
 */
export function evaluateDraftRuleDeterministic(
  candidate: CompiledRule,
  _candidateLineNumber: number,
  acceptedRules: AcceptedDraftRule[],
  boardSize: BoardSize
): DraftResolutionEvaluation {
  // Check against all earlier accepted rules
  for (const accepted of acceptedRules) {
    // 1. Exact duplicate check
    if (isDuplicateRule(candidate, accepted.rule)) {
      return {
        status: 'removed-duplicate',
        reason: `Duplicate of Rule on Line ${accepted.lineNumber}. Earlier rule takes precedence.`,
        conflictingLineNumber: accepted.lineNumber,
      };
    }

    // 2. Conflict check
    const conflict = findRuleConflict(candidate, accepted.rule);
    if (conflict.hasConflict) {
      return {
        status: 'removed-conflict',
        reason: `Conflicts with Line ${accepted.lineNumber}: ${conflict.reason}`,
        conflictingLineNumber: accepted.lineNumber,
      };
    }
  }

  // 3. Ledger capacity check
  const ledgerLimit = getLedgerLimit(boardSize);
  if (acceptedRules.length >= ledgerLimit) {
    return {
      status: 'removed-ledger-full',
      reason: `Ledger capacity reached (${ledgerLimit} rules max for ${boardSize}-tile board). Later rule dropped.`,
    };
  }

  // 4. Accepted
  return {
    status: 'accepted',
    reason: 'Rule ratified into match ledger.',
  };
}
