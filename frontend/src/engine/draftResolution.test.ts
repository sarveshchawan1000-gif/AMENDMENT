import { describe, it, expect } from 'vitest';
import {
  evaluateDraftRuleDeterministic,
  getLedgerLimit,
  isDuplicateRule,
  AcceptedDraftRule,
} from './draftResolution';
import { CompiledRule } from '../types/game';

function createMockRule(overrides: Partial<CompiledRule> = {}): CompiledRule {
  return {
    id: 'R-mock',
    schema_version: '1.0',
    title: 'Mock Rule',
    original_text: 'When I roll even, gain 2 points.',
    normalized_rule: 'When active player rolls even, gain 2 points.',
    readable_meaning: 'on_roll: add_score (2) targeting active_player.',
    proposer_id: 'p1',
    proposer_name: 'Player 1',
    creation_turn: 0,
    trigger: 'on_roll',
    condition: 'roll_is_even',
    effect: 'add_score',
    effect_value: 2,
    target: 'active_player',
    duration: 'permanent',
    activation_boundary: 'next_turn',
    active_from_turn: 1,
    status: 'active',
    is_base_rule: false,
    ...overrides,
  };
}

describe('draftResolution', () => {
  it('correctly maps ledger limit to board size', () => {
    expect(getLedgerLimit(36)).toBe(8);
    expect(getLedgerLimit(64)).toBe(12);
    expect(getLedgerLimit(100)).toBe(16);
  });

  it('detects duplicate rules (removed-duplicate)', () => {
    const rule1 = createMockRule({
      id: 'R-1',
      normalized_rule: 'When active player rolls even, gain 2 points.',
    });
    const rule2 = createMockRule({
      id: 'R-2',
      normalized_rule: 'When active player rolls even, gain 2 points.',
    });

    expect(isDuplicateRule(rule1, rule2)).toBe(true);

    const accepted: AcceptedDraftRule[] = [{ lineNumber: 1, rule: rule1 }];
    const evalResult = evaluateDraftRuleDeterministic(rule2, 2, accepted, 36);

    expect(evalResult.status).toBe('removed-duplicate');
    expect(evalResult.conflictingLineNumber).toBe(1);
    expect(evalResult.reason).toContain('Duplicate of Rule on Line 1');
  });

  it('detects set_win_target pairs and removes the second rule (removed-conflict)', () => {
    const rule1 = createMockRule({
      id: 'R-1',
      trigger: 'win_check',
      condition: 'always',
      effect: 'set_win_target',
      effect_value: 25,
      target: 'all_players',
      normalized_rule: 'Win target set to 25 points.',
    });
    const rule2 = createMockRule({
      id: 'R-2',
      trigger: 'win_check',
      condition: 'always',
      effect: 'set_win_target',
      effect_value: 30,
      target: 'all_players',
      normalized_rule: 'Win target set to 30 points.',
    });

    const accepted: AcceptedDraftRule[] = [{ lineNumber: 1, rule: rule1 }];
    const evalResult = evaluateDraftRuleDeterministic(rule2, 2, accepted, 36);

    expect(evalResult.status).toBe('removed-conflict');
    expect(evalResult.conflictingLineNumber).toBe(1);
    expect(evalResult.reason).toContain('Multiple win target rules');
  });

  it('detects opposite add_score effects on same trigger, condition, and target (removed-conflict)', () => {
    const rule1 = createMockRule({
      id: 'R-1',
      trigger: 'on_roll',
      condition: 'roll_is_even',
      target: 'active_player',
      effect: 'add_score',
      effect_value: 3,
      normalized_rule: 'When active player rolls even, gain 3 points.',
    });
    const rule2 = createMockRule({
      id: 'R-2',
      trigger: 'on_roll',
      condition: 'roll_is_even',
      target: 'active_player',
      effect: 'add_score',
      effect_value: -3,
      normalized_rule: 'When active player rolls even, lose 3 points.',
    });

    const accepted: AcceptedDraftRule[] = [{ lineNumber: 1, rule: rule1 }];
    const evalResult = evaluateDraftRuleDeterministic(rule2, 2, accepted, 36);

    expect(evalResult.status).toBe('removed-conflict');
    expect(evalResult.conflictingLineNumber).toBe(1);
    expect(evalResult.reason).toContain('Contradictory score direction');
  });

  it('enforces ledger-full capacity limit (removed-ledger-full)', () => {
    const accepted: AcceptedDraftRule[] = [];
    const boardSize = 36; // Limit = 8 rules

    for (let i = 1; i <= 8; i++) {
      accepted.push({
        lineNumber: i,
        rule: createMockRule({
          id: `R-${i}`,
          trigger: 'on_land',
          condition: 'always',
          effect_value: i % 5 + 1,
          normalized_rule: `Rule on tile slot ${i}`,
        }),
      });
    }

    const ninthRule = createMockRule({
      id: 'R-9',
      trigger: 'on_turn_start',
      condition: 'always',
      effect_value: 1,
      normalized_rule: 'A completely unique 9th rule',
    });

    const evalResult = evaluateDraftRuleDeterministic(ninthRule, 9, accepted, boardSize);

    expect(evalResult.status).toBe('removed-ledger-full');
    expect(evalResult.reason).toContain('Ledger capacity reached (8 rules max for 36-tile board)');
  });

  it('demonstrates order-dependence: earlier rule is accepted, later rule is removed', () => {
    const ruleA = createMockRule({
      id: 'R-A',
      trigger: 'win_check',
      condition: 'always',
      effect: 'set_win_target',
      effect_value: 20,
      target: 'all_players',
      normalized_rule: 'Win target is 20.',
    });

    const ruleB = createMockRule({
      id: 'R-B',
      trigger: 'win_check',
      condition: 'always',
      effect: 'set_win_target',
      effect_value: 40,
      target: 'all_players',
      normalized_rule: 'Win target is 40.',
    });

    // Scenario 1: Rule A at Line 1, Rule B at Line 2
    const accepted1: AcceptedDraftRule[] = [];
    const evalA1 = evaluateDraftRuleDeterministic(ruleA, 1, accepted1, 64);
    expect(evalA1.status).toBe('accepted');
    accepted1.push({ lineNumber: 1, rule: ruleA });

    const evalB1 = evaluateDraftRuleDeterministic(ruleB, 2, accepted1, 64);
    expect(evalB1.status).toBe('removed-conflict');
    expect(evalB1.conflictingLineNumber).toBe(1);

    // Scenario 2: Reverse order - Rule B at Line 1, Rule A at Line 2
    const accepted2: AcceptedDraftRule[] = [];
    const evalB2 = evaluateDraftRuleDeterministic(ruleB, 1, accepted2, 64);
    expect(evalB2.status).toBe('accepted');
    accepted2.push({ lineNumber: 1, rule: ruleB });

    const evalA2 = evaluateDraftRuleDeterministic(ruleA, 2, accepted2, 64);
    expect(evalA2.status).toBe('removed-conflict');
    expect(evalA2.conflictingLineNumber).toBe(1);
  });
});
