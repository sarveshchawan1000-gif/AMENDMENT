// AMENDMENT Type Definitions based on PRD baseline

export type BoardSize = 36 | 64 | 100;
export type DiceType = '1d6' | '2d6' | '1d12';
export type RuleMode = 'live' | 'draft' | 'hybrid';
export type ThemeMode = 'light' | 'dark';

export interface PointHistoryItem {
  id: string;
  turn: number;
  type: 'dice_roll' | 'amendment';
  title: string;
  delta: number;
  priorScore: number;
  resultingScore: number;
  details: string;
  timestamp: number;
  ruleId?: string;
  ruleTitle?: string;
  ruleSource?: string;
  trigger?: string;
  explanation?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  position: number; // 1-indexed, 1 to BoardSize
  isGemma: boolean;
  avatar: string;
  totalAmendmentsPassed: number;
  pointHistory?: PointHistoryItem[];
}

export type RuleTrigger = 'on_roll' | 'on_land' | 'on_turn_start' | 'win_check';
export type RuleCondition = 'is_leader' | 'is_last' | 'roll_is_even' | 'tile_is_prime' | 'score_gt' | 'always';
export type RuleEffect = 'add_score' | 'steal_score' | 'move' | 'skip_turn' | 'reroll' | 'set_win_target';
export type TargetSelector = 'self' | 'active_player' | 'leader' | 'last_place' | 'all_players' | 'opponents';
export type RuleStatus = 'pending' | 'active' | 'expired' | 'rejected' | 'overridden' | 'removed';
export type RuleDuration = 'permanent' | '1_turn' | '2_turns' | '3_turns';
export type ActivationBoundary = 'immediate' | 'next_turn' | 'next_round';

export interface CompiledRule {
  id: string; // e.g. "R1", "R2", "R3", "AM-101"
  schema_version: '1.0';
  title: string;
  original_text: string;
  normalized_rule: string;
  readable_meaning: string;
  proposer_id: string;
  proposer_name: string;
  creation_turn: number;
  trigger: RuleTrigger;
  condition: RuleCondition;
  condition_value?: number;
  effect: RuleEffect;
  effect_value: number; // capped at ±5 points, win_target 21-64 per validate.py
  target: TargetSelector;
  duration: RuleDuration;
  duration_remaining?: number; // turns left before expiration
  activation_boundary: ActivationBoundary;
  active_from_turn: number;
  status: RuleStatus;
  is_base_rule: boolean;
  conflicts?: string[];
  loophole_risk?: {
    score: 'low' | 'medium' | 'high';
    note: string;
  };
}

export interface AIRuling {
  status: 'accepted' | 'rejected';
  normalized_rule: string;
  compiled_rule?: CompiledRule;
  reason: string;
  conflicts?: string[];
  ambiguities?: string[];
  loophole_risk?: {
    score: 'low' | 'medium' | 'high';
    note: string;
  };
  suggested_fix?: string;
  timestamp: number;
}

export interface RuleFiredSummary {
  rule_id: string;
  rule_title: string;
  is_base_rule: boolean;
  effect_summary: string;
  score_delta?: number;
  position_delta?: number;
  target_player_id?: string;
}

export interface GameEventLog {
  id: string;
  turn: number;
  player_id: string;
  player_name: string;
  player_color: string;
  phase: 'turn_start' | 'roll' | 'movement' | 'landing' | 'amendment' | 'win_check';
  description: string;
  dice_roll?: number;
  dice_type?: DiceType;
  start_pos?: number;
  end_pos?: number;
  prior_score: number;
  resulting_score: number;
  score_delta: number;
  prior_position: number;
  resulting_position: number;
  rules_fired: RuleFiredSummary[];
  timestamp: number;
}

export interface BundledRulebook {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  author: string;
  compatible_board_sizes: BoardSize[];
  rules: Omit<CompiledRule, 'proposer_id' | 'proposer_name' | 'creation_turn' | 'active_from_turn'>[];
}

export interface GameConfig {
  boardSize: BoardSize;
  dice: DiceType;
  winTarget: number;
  players: {
    id: string;
    name: string;
    color: string;
    isGemma: boolean;
    avatar: string;
  }[];
  mode: RuleMode;
  theme: ThemeMode;
  selectedRulebookId?: string;
  amendmentCadenceMoves: number; // e.g., 1 or 2 turns between proposals
  allowGemmaProposals: boolean;
  simulateOfflineModel: boolean;
  simulatedAiLatency?: boolean;
}

export interface GameState {
  config: GameConfig;
  turnCount: number;
  activePlayerIndex: number;
  players: Player[];
  rules: CompiledRule[];
  events: GameEventLog[];
  winner: Player | null;
  phase: 'setup' | 'draft_stage' | 'turn_start' | 'waiting_for_roll' | 'moving' | 'eligible_for_amendment' | 'ruling_modal' | 'game_over';
  currentDiceRoll: number | null;
  latestRuling: AIRuling | null;
  selectedAutopsyEvent: GameEventLog | null;
  isInterpretingRule: boolean;
  // Draft mode tracking
  draftTurnIndex: number;
  draftProposalsRemaining: Record<string, number>;
  /**
   * Per-player personal move counter.
   * Keyed by player.id. Incremented each time that player completes a move.
   * Used for cadence checks ("every N moves") so every player gets equal
   * proposal opportunities regardless of global turn order.
   */
  playerMoveCounts: Record<string, number>;
  draft?: DraftSlice;
}

export type DraftLineStatus =
  | 'pending'
  | 'checking'
  | 'accepted'
  | 'removed-conflict'
  | 'removed-duplicate'
  | 'removed-invalid'
  | 'removed-ledger-full'
  | 'check-failed';

export interface DraftLineInput {
  lineNumber: number; // 1-indexed (1..N*3)
  playerId: string;
  playerName: string;
  playerColor: string;
  playerAvatar: string;
  text: string;
}

export interface DraftLineResult {
  lineNumber: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  playerAvatar: string;
  originalText: string;
  status: DraftLineStatus;
  reason: string;
  conflictingLineNumber?: number;
  compiledRule?: CompiledRule;
  aiRuling?: AIRuling;
  rawJson?: Record<string, unknown> | null;
}

export interface DraftSlice {
  lines: DraftLineInput[];
  results: Record<number, DraftLineResult>;
  isProcessing: boolean;
  currentCheckingIndex: number;
  isSubmitted: boolean;
  isComplete: boolean;
}
