import { CompiledRule } from '../types/game';

/**
 * Adapt a rule compiled by the backend Court into the frontend CompiledRule structure.
 */
export function adaptBackendRuleToCompiledRule(
  backendRule: Record<string, unknown>,
  originalText: string,
  proposerId: string,
  proposerName: string,
  creationTurn: number = 1,
): CompiledRule {
  const conditionObject = (
    backendRule.condition &&
    typeof backendRule.condition === 'object'
  )
    ? (backendRule.condition as {
        mode?: string;
        predicates?: Array<Record<string, unknown>>;
      })
    : {};

  const predicate = conditionObject.predicates?.[0];
  const rawCondition = String(predicate?.name ?? predicate?.type ?? 'always');
  const conditionMap: Record<string, CompiledRule['condition']> = {
    is_leader: 'is_leader',
    is_last: 'is_last',
    roll_is_even: 'roll_is_even',
    tile_is_prime: 'tile_is_prime',
    score_gt: 'score_gt',
  };

  const effectObject = (
    backendRule.effect &&
    typeof backendRule.effect === 'object'
  )
    ? (backendRule.effect as Record<string, unknown>)
    : {};

  const effectType = String(effectObject.type ?? 'add_score');
  const effectMap: Record<string, CompiledRule['effect']> = {
    add_score: 'add_score',
    steal_score: 'steal_score',
    move: 'move',
    skip_turn: 'skip_turn',
    reroll: 'reroll',
    set_win_target: 'set_win_target',
  };

  const rawTarget = String(effectObject.target ?? 'self');
  const targetMap: Record<string, CompiledRule['target']> = {
    self: 'active_player',
    leader: 'leader',
    last: 'last_place',
    all_others: 'opponents',
  };

  const trigger = String(backendRule.trigger ?? 'on_land');
  const safeTrigger: CompiledRule['trigger'] =
    trigger === 'on_roll' ||
    trigger === 'on_turn_start' ||
    trigger === 'win_check'
      ? trigger
      : 'on_land';

  const ruleId = String(backendRule.id ?? `AM-${Date.now()}`);
  const args = predicate?.args as Record<string, unknown> | undefined;
  const conditionValue = Number(args?.value ?? predicate?.value);
  const effectValue = Number(effectObject.amount ?? 0);
  const sourceText = String(backendRule.source ?? originalText);

  return {
    id: ruleId,
    schema_version: '1.0',
    title: `Amendment ${ruleId}`,
    original_text: sourceText,
    normalized_rule: sourceText,
    readable_meaning: `${safeTrigger}: ${effectMap[effectType] ?? 'add_score'} (${effectValue}) targeting ${rawTarget}.`,
    proposer_id: proposerId,
    proposer_name: proposerName,
    creation_turn: creationTurn,
    trigger: safeTrigger,
    condition: conditionMap[rawCondition] ?? 'always',
    ...(rawCondition === 'score_gt' && Number.isFinite(conditionValue)
      ? { condition_value: conditionValue }
      : {}),
    effect: effectMap[effectType] ?? 'add_score',
    effect_value: Number.isFinite(effectValue) ? effectValue : 0,
    target: targetMap[rawTarget] ?? 'active_player',
    duration: 'permanent',
    activation_boundary: 'next_turn',
    active_from_turn: creationTurn + 1,
    status: 'active',
    is_base_rule: false,
  };
}
