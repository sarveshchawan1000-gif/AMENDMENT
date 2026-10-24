import React, { useState, useEffect } from 'react';
import {
  createBackendGame,
  rollBackendTurn,
  submitBackendAmendment,
  passBackendAmendment,
} from './services/gameApi';
import {
  CompiledRule,
  GameConfig,
  GameState,
  Player,
} from './types/game';
import { BASE_RULES, BUNDLED_RULEBOOKS } from './data/rulebooks';
import { Header } from './components/Header';
import { SetupScreen } from './components/SetupScreen';
import { DraftScreen } from './components/DraftScreen';
import { Board } from './components/Board';
import { DiceAndControls } from './components/DiceAndControls';
import { Leaderboard } from './components/Leaderboard';
import { RuleLedger } from './components/RuleLedger';
import { ProposalComposer } from './components/ProposalComposer';
import { AIRulingModal } from './components/AIRulingModal';
import { RuleAutopsyModal } from './components/RuleAutopsyModal';
import { EventHistoryFeed } from './components/EventHistoryFeed';
import { GameOverModal } from './components/GameOverModal';
import { EvaluationModal } from './components/EvaluationModal';
import {
  advanceTurnAfterAmendment,
  executePlayerRollAndMove,
} from './engine/gameEngine';
import {
  generateGemmaProposal,
  submitProposalForAdmission,
} from './services/admissionService';

const INITIAL_CONFIG: GameConfig = {
  boardSize: 36,
  dice: '1d6',
  winTarget: 15,
  players: [
    { id: 'p1', name: 'Player 1', color: 'var(--p1)', isGemma: false, avatar: '⚖️' },
    { id: 'p2', name: 'Player 2', color: 'var(--p2)', isGemma: false, avatar: '📜' },
  ],
  mode: 'live',
  theme: 'light',
  amendmentCadenceMoves: 1,
  allowGemmaProposals: true,
  simulateOfflineModel: false,
};

export const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    config: INITIAL_CONFIG,
    turnCount: 1,
    activePlayerIndex: 0,
    players: [],
    rules: [...BASE_RULES],
    events: [],
    winner: null,
    phase: 'setup',
    currentDiceRoll: null,
    latestRuling: null,
    selectedAutopsyEvent: null,
    isInterpretingRule: false,
    draftTurnIndex: 0,
    draftProposalsRemaining: {},
    playerMoveCounts: {},
  });

  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [backendGameId, setBackendGameId] = useState<string | null>(null);
  const [amendmentProposerId, setAmendmentProposerId] = useState<string | null>(null);
  const [showProposalComposer, setShowProposalComposer] = useState<boolean>(false);
  const [showRulingModal, setShowRulingModal] = useState<boolean>(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState<boolean>(false);

  const handleResetGame = () => {
    setBackendGameId(null);
    setAmendmentProposerId(null);
    setShowProposalComposer(false);
    setShowRulingModal(false);
    setState((prev) => ({
      ...prev,
      phase: 'setup',
      winner: null,
      turnCount: 1,
      events: [],
      rules: [...BASE_RULES],
    }));
  };

  const handleToggleAiOffline = () => {
    setState((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        simulateOfflineModel: !prev.config.simulateOfflineModel,
      },
    }));
  };

  // Start Game handler from Setup screen
  const handleStartGame = async (config: GameConfig) => {
    try {
      const boardSizeMap = {
        36: 6,
        64: 8,
        100: 10,
      } as const;

      const backendSettings = {
        board_size: boardSizeMap[config.boardSize],
        dice_type: config.dice,
        win_target: config.winTarget,
        mode: config.mode,
        max_rules: 12 as const,
        ...(config.mode === 'live'
          ? { amend_every: config.amendmentCadenceMoves as 1 | 2 }
          : {}),
      };

      const createdGame = await createBackendGame(
        backendSettings,
        config.players.map(({ id, name }) => ({ id, name })),
      );

      setBackendGameId(createdGame.game_id);
      console.info('Backend game created:', createdGame.game_id);
    } catch (error) {
      if (config.mode === 'draft') {
        console.warn('Backend unavailable, proceeding with local Draft flow:', error);
        setBackendGameId(`draft-local-${Date.now()}`);
      } else {
        const message =
          error instanceof Error ? error.message : 'Unknown API error';

        window.alert(`Could not create game on the backend: ${message}`);
        console.error('Backend game creation failed:', error);
        return;
      }
    }

    const initializedPlayers: Player[] = config.players.map((p) => ({
      ...p,
      score: 0,
      position: 1,
      totalAmendmentsPassed: 0,
    }));

    let initialRules: CompiledRule[] = [...BASE_RULES];

    // If Hybrid mode, add the bundled curated rules
    if (config.mode === 'hybrid' && config.selectedRulebookId) {
      const book = BUNDLED_RULEBOOKS.find((b) => b.id === config.selectedRulebookId);
      if (book) {
        const bundledCompiled: CompiledRule[] = book.rules.map((r) => ({
          ...r,
          proposer_id: 'rulebook',
          proposer_name: book.title,
          creation_turn: 0,
          active_from_turn: 1,
          status: 'active',
        }));
        initialRules = [...initialRules, ...bundledCompiled];
      }
    }

    const initialPhase = config.mode === 'draft' ? 'draft_stage' : 'waiting_for_roll';

    setState({
      config,
      turnCount: 1,
      activePlayerIndex: 0,
      players: initializedPlayers,
      rules: initialRules,
      events: [],
      winner: null,
      phase: initialPhase,
      currentDiceRoll: null,
      latestRuling: null,
      selectedAutopsyEvent: null,
      isInterpretingRule: false,
      draftTurnIndex: 0,
      draftProposalsRemaining: {},
      playerMoveCounts: {},
    });
  };

  // Draft mode completion handler
  const handleDraftStartMatch = (
    acceptedRules: CompiledRule[],
    rejectedRules: CompiledRule[],
  ) => {
    setState((prev) => {
      const passedCounts: Record<string, number> = {};
      acceptedRules.forEach((rule) => {
        passedCounts[rule.proposer_id] = (passedCounts[rule.proposer_id] || 0) + 1;
      });

      const updatedPlayers = prev.players.map((p) => ({
        ...p,
        totalAmendmentsPassed: (passedCounts[p.id] || 0),
      }));

      return {
        ...prev,
        players: updatedPlayers,
        rules: [...prev.rules, ...acceptedRules, ...rejectedRules],
        phase: 'waiting_for_roll',
      };
    });
  };

  // Turn Roll Handler
  const handleRollDice = async () => {
  if (
    state.phase !== 'waiting_for_roll' ||
    isRolling ||
    !backendGameId
  ) {
    return;
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return;

  setIsRolling(true);

  try {
    // Preserve the dice animation.
    await new Promise((resolve) => setTimeout(resolve, 450));

    const response = await rollBackendTurn(
      backendGameId,
      activePlayer.id,
    );

    const backendState = response.state;

    const updatedPlayers: Player[] = state.players.map((player) => {
      const backendPlayer = backendState.players.find(
        (candidate) => candidate.id === player.id,
      );

      if (!backendPlayer) return player;

      return {
        ...player,
        score: backendPlayer.score,
        position: backendPlayer.position,
      };
    });

    const winner =
      updatedPlayers.find(
        (player) => player.id === backendState.winner,
      ) ?? null;

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      activePlayerIndex: backendState.current_player,
      turnCount: backendState.turn + 1,
      currentDiceRoll: response.roll,
      winner,
      phase:
        backendState.phase === 'finished'
          ? 'game_over'
          : 'waiting_for_roll',
    };

    setState(nextState);

    if (
      !winner &&
      nextState.config.mode === 'live' &&
      backendState.moves_since_amend >=
        (backendState.settings.amend_every ?? 1)
    ) {
      const proposer = updatedPlayers.find(
        (player) => player.id === activePlayer.id,
      );

      if (proposer) {
        setAmendmentProposerId(proposer.id);

        if (proposer.isGemma) {
          setTimeout(() => {
            const botProposal = generateGemmaProposal({
              proposer,
              currentTurn: nextState.turnCount,
              config: nextState.config,
              activeRules: nextState.rules,
            });

            void handleProposalSubmit(botProposal, proposer.id);
          }, 800);
        } else {
          setShowProposalComposer(true);
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown API error';

    window.alert(`Could not execute turn: ${message}`);
    console.error('Backend turn failed:', error);
  } finally {
    setIsRolling(false);
  }
};


  // Bot auto-play for Gemma's turn
  useEffect(() => {
    if (state.phase === 'waiting_for_roll' && !isRolling && !state.winner) {
      const activePlayer = state.players[state.activePlayerIndex];

      if (activePlayer?.isGemma) {
        const timer = setTimeout(() => {
          void handleRollDice();
        }, 1000);

        return () => clearTimeout(timer);
      }
    }
  }, [state.phase, state.activePlayerIndex, isRolling, state.winner]);

  // Proposal Submission Handler: backend is authoritative.
  const handleProposalSubmit = async (
    text: string,
    proposerId?: string,
  ) => {
    setShowProposalComposer(false);

    const actualProposerId = proposerId ?? amendmentProposerId;
    const proposer = state.players.find(
      (player) => player.id === actualProposerId,
    );

    if (!backendGameId || !actualProposerId || !proposer) {
      window.alert("Could not identify the amendment proposer. Please try again.");
      return;
    }

    setAmendmentProposerId(actualProposerId);
    setShowRulingModal(true);
    setState((prev) => ({ ...prev, isInterpretingRule: true }));

    try {
      const response = await submitBackendAmendment(
        backendGameId,
        actualProposerId,
        text,
      );

      const backendRule = response.rule;
      let compiledRule: CompiledRule | undefined;

      if (response.accepted && backendRule) {
        const conditionObject = (
          backendRule.condition &&
          typeof backendRule.condition === "object"
        )
          ? backendRule.condition as {
              mode?: string;
              predicates?: Array<Record<string, unknown>>;
            }
          : {};

        const predicate = conditionObject.predicates?.[0];
        const rawCondition = String(predicate?.type ?? "always");
        const conditionMap: Record<string, CompiledRule["condition"]> = {
          is_leader: "is_leader",
          is_last: "is_last",
          roll_is_even: "roll_is_even",
          tile_is_prime: "tile_is_prime",
          score_gt: "score_gt",
        };

        const effectObject = (
          backendRule.effect &&
          typeof backendRule.effect === "object"
        )
          ? backendRule.effect as Record<string, unknown>
          : {};

        const effectType = String(effectObject.type ?? "add_score");
        const effectMap: Record<string, CompiledRule["effect"]> = {
          add_score: "add_score",
          steal_score: "steal_score",
          move: "move",
          skip_turn: "skip_turn",
          reroll: "reroll",
          set_win_target: "set_win_target",
        };

        const rawTarget = String(effectObject.target ?? "self");
        const targetMap: Record<string, CompiledRule["target"]> = {
          self: "active_player",
          leader: "leader",
          last: "last_place",
          all_others: "opponents",
        };

        const trigger = String(backendRule.trigger ?? "on_land");
        const safeTrigger: CompiledRule["trigger"] =
          trigger === "on_roll" ||
          trigger === "on_turn_start" ||
          trigger === "win_check"
            ? trigger
            : "on_land";

        const ruleId = String(backendRule.id ?? `A-${Date.now()}`);
        const conditionValue = Number(predicate?.value);
        const effectValue = Number(effectObject.amount ?? 0);
        const originalText = String(backendRule.source ?? text);

        compiledRule = {
          id: ruleId,
          schema_version: "1.0",
          title: `Amendment ${ruleId}`,
          original_text: originalText,
          normalized_rule: originalText,
          readable_meaning:
            `${safeTrigger}: ${effectMap[effectType] ?? "add_score"} ` +
            `(${effectValue}) targeting ${rawTarget}.`,
          proposer_id: actualProposerId,
          proposer_name: proposer.name,
          creation_turn: state.turnCount,
          trigger: safeTrigger,
          condition: conditionMap[rawCondition] ?? "always",
          ...(rawCondition === "score_gt" && Number.isFinite(conditionValue)
            ? { condition_value: conditionValue }
            : {}),
          effect: effectMap[effectType] ?? "add_score",
          effect_value: Number.isFinite(effectValue) ? effectValue : 0,
          target: targetMap[rawTarget] ?? "active_player",
          duration: "permanent",
          activation_boundary: "next_turn",
          active_from_turn: state.turnCount + 1,
          status: "active",
          is_base_rule: false,
        };
      }

      const ruling: import("./types/game").AIRuling = {
        status: response.accepted ? "accepted" : "rejected",
        normalized_rule: compiledRule?.normalized_rule ?? text,
        ...(compiledRule ? { compiled_rule: compiledRule } : {}),
        reason: response.accepted
          ? "Amendment accepted."
          : response.category === "not_a_game_rule"
            ? "This is not a game rule. Please propose a rule that changes the gameplay."
            : response.category === "invalid_rule"
              ? response.error ?? "Invalid rule: This rule violates the game's constraints."
              : response.error ?? "The backend Court rejected this amendment.",
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        rules: compiledRule
          ? [...prev.rules, compiledRule]
          : prev.rules,
        players: prev.players.map((player) =>
          player.id === actualProposerId && response.accepted
            ? {
                ...player,
                totalAmendmentsPassed: player.totalAmendmentsPassed + 1,
              }
            : player,
        ),
        latestRuling: ruling,
        isInterpretingRule: false,
      }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Unknown API error";

      setState((prev) => ({
        ...prev,
        latestRuling: {
          status: "rejected",
          normalized_rule: text,
          reason: `Could not submit amendment to the backend: ${message}`,
          timestamp: Date.now(),
        },
        isInterpretingRule: false,
      }));

      console.error("Backend amendment failed:", error);
    }
  };

  // The backend already advanced the turn after the roll.
  const handleDismissRuling = () => {
    setShowRulingModal(false);
    setAmendmentProposerId(null);
  };

  // Passing must not advance the player a second time.
  const handlePassTurn = async () => {
    const proposerId = amendmentProposerId;

    setShowProposalComposer(false);

    if (!backendGameId || !proposerId) {
      setAmendmentProposerId(null);
      return;
    }

    try {
      const response = await passBackendAmendment(
        backendGameId,
        proposerId,
      );

      if (!response.accepted) {
        console.warn('Could not pass amendment:', response.error);
      }
    } catch (error) {
      console.error('Failed to pass amendment:', error);
      alert(
        `Could not pass the amendment: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setAmendmentProposerId(null);
    }
  };

  // Export JSON rulebook
  const handleExportRulebook = () => {
    const dataToExport = {
      title: `AMENDMENT Match Rules (Turn ${state.turnCount})`,
      exported_at: new Date().toISOString(),
      board_size: state.config.boardSize,
      win_target: state.config.winTarget,
      active_rules: state.rules.filter((r) => r.status === 'active'),
      all_rules_history: state.rules,
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `amendment-ruleset-turn-${state.turnCount}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Top Header */}
      <Header
        state={state}
        onResetGame={handleResetGame}
        onOpenEvaluation={() => setShowEvaluationModal(true)}
        onExportRulebook={handleExportRulebook}
        onToggleAiOffline={handleToggleAiOffline}
      />

      {/* Main Container */}
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        {state.phase === 'setup' ? (
          <SetupScreen onStartGame={handleStartGame} />
        ) : state.phase === 'draft_stage' ? (
          <DraftScreen
            config={state.config}
            players={state.players}
            onStartMatch={handleDraftStartMatch}
            onCancelDraft={() => setState((prev) => ({ ...prev, phase: 'setup' }))}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Board + Action Bar + Proceedings Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Board
                boardSize={state.config.boardSize}
                players={state.players}
                activePlayerIndex={state.activePlayerIndex}
              />

              <DiceAndControls
                state={state}
                onRollDice={handleRollDice}
                onOpenProposalComposer={() => setShowProposalComposer(true)}
                onPassTurn={handlePassTurn}
                isRolling={isRolling}
              />

              <EventHistoryFeed
                events={state.events}
                onSelectEvent={(evt) => setState((prev) => ({ ...prev, selectedAutopsyEvent: evt }))}
              />
            </div>

            {/* Right Column: Leaderboard + Rule Ledger */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Leaderboard
                players={state.players}
                activePlayerIndex={state.activePlayerIndex}
                winTarget={state.config.winTarget}
                boardSize={state.config.boardSize}
              />

              <RuleLedger
                rules={state.rules}
                currentTurn={state.turnCount}
              />
            </div>
          </div>
        )}
      </main>

      {/* Proposal Composer Modal */}
      {showProposalComposer && (state.players.find((player) => player.id === amendmentProposerId) || state.players[state.activePlayerIndex]) && (
        <ProposalComposer
          proposer={state.players.find((player) => player.id === amendmentProposerId) || state.players[state.activePlayerIndex]}
          currentTurn={state.turnCount}
          onSubmitProposal={handleProposalSubmit}
          onCancel={() => setShowProposalComposer(false)}
          isInterpreting={state.isInterpretingRule}
        />
      )}

      {/* AI Ruling Result Modal */}
      {showRulingModal && (
        <AIRulingModal
          ruling={state.latestRuling}
          proposer={state.players.find((player) => player.id === amendmentProposerId) || state.players[0]}
          isInterpreting={state.isInterpretingRule}
          onDismiss={handleDismissRuling}
        />
      )}

      {/* Rule Autopsy Modal */}
      {state.selectedAutopsyEvent && (
        <RuleAutopsyModal
          event={state.selectedAutopsyEvent}
          onClose={() => setState((prev) => ({ ...prev, selectedAutopsyEvent: null }))}
        />
      )}

      {/* Game Over Celebration Modal */}
      {state.winner && (
        <GameOverModal
          winner={state.winner}
          players={state.players}
          rules={state.rules}
          events={state.events}
          turnCount={state.turnCount}
          onPlayAgain={handleResetGame}
          onExportRulebook={handleExportRulebook}
        />
      )}

      {/* Rules / Evaluation Modal */}
      {showEvaluationModal && (
        <EvaluationModal
          config={state.config}
          rules={state.rules}
          phase={state.phase}
          turnCount={state.turnCount}
          onClose={() => setShowEvaluationModal(false)}
        />
      )}
    </div>
  );
};
