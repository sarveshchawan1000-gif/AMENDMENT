import React, { useState, useEffect } from 'react';
import {
  CompiledRule,
  GameConfig,
  GameState,
  Player,
} from './types/game';
import { BASE_RULES, BUNDLED_RULEBOOKS } from './data/rulebooks';
import { Header } from './components/Header';
import { SetupScreen } from './components/SetupScreen';
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
  const [showProposalComposer, setShowProposalComposer] = useState<boolean>(false);
  const [showRulingModal, setShowRulingModal] = useState<boolean>(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState<boolean>(false);

  const handleResetGame = () => {
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
  const handleStartGame = (config: GameConfig) => {
    const initializedPlayers: Player[] = config.players.map((p) => ({
      ...p,
      score: 0,
      position: 1,
      totalAmendmentsPassed: 0,
      movesPlayed: 0,
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

    setState({
      config,
      turnCount: 1,
      activePlayerIndex: 0,
      players: initializedPlayers,
      rules: initialRules,
      events: [],
      winner: null,
      phase: 'waiting_for_roll',
      currentDiceRoll: null,
      latestRuling: null,
      selectedAutopsyEvent: null,
      isInterpretingRule: false,
      draftTurnIndex: 0,
      draftProposalsRemaining: {},
      playerMoveCounts: {},
    });
  };

  // Turn Roll Handler
  const handleRollDice = () => {
    if (state.phase !== 'waiting_for_roll' || isRolling) return;

    setIsRolling(true);

    // Subtle dice roll shake animation (400ms)
    setTimeout(() => {
      setIsRolling(false);
      const { nextState } = executePlayerRollAndMove(state);
      setState(nextState);

      // If eligible for amendment in live mode, open composer
      if (nextState.phase === 'eligible_for_amendment') {
        const active = nextState.players[nextState.activePlayerIndex];
        if (active.isGemma) {
          // Autonomous Gemma bot proposal
          setTimeout(() => {
            const botProposal = generateGemmaProposal({
              proposer: active,
              currentTurn: nextState.turnCount,
              config: nextState.config,
              activeRules: nextState.rules,
            });
            handleProposalSubmit(botProposal);
          }, 800);
        } else {
          setShowProposalComposer(true);
        }
      }
    }, 450);
  };

  // Bot auto-play for Gemma's turn
  useEffect(() => {
    if (state.phase === 'waiting_for_roll' && !isRolling && !state.winner) {
      const activePlayer = state.players[state.activePlayerIndex];
      if (activePlayer && activePlayer.isGemma) {
        const timer = setTimeout(() => {
          handleRollDice();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [state.phase, state.activePlayerIndex, isRolling, state.winner]);

  // Proposal Submission Handler
  const handleProposalSubmit = async (text: string) => {
    setShowProposalComposer(false);
    setState((prev) => ({ ...prev, isInterpretingRule: true }));
    setShowRulingModal(true);

    const activePlayer = state.players[state.activePlayerIndex];
    const ruling = await submitProposalForAdmission(text, {
      proposer: activePlayer,
      currentTurn: state.turnCount,
      config: state.config,
      activeRules: state.rules,
      offlineModel: state.config.simulateOfflineModel,
    });

    setState((prev) => {
      let updatedRules = [...prev.rules];
      let updatedPlayers = [...prev.players];

      if (ruling.status === 'accepted' && ruling.compiled_rule) {
        // Enact rule: marked as active starting at next turn boundary
        updatedRules.push(ruling.compiled_rule);
        // Increment proposer's amendment count
        const pIdx = updatedPlayers.findIndex((p) => p.id === activePlayer.id);
        if (pIdx !== -1) {
          updatedPlayers[pIdx].totalAmendmentsPassed += 1;
        }
      } else {
        // Record rejected rule in history for transparency
        const rejectedRule: CompiledRule = {
          id: `REJ-${Date.now().toString().slice(-4)}`,
          schema_version: '1.0',
          title: 'Rejected Proposal',
          original_text: text,
          normalized_rule: ruling.normalized_rule,
          readable_meaning: ruling.reason,
          proposer_id: activePlayer.id,
          proposer_name: activePlayer.name,
          creation_turn: prev.turnCount,
          trigger: 'on_roll',
          condition: 'always',
          effect: 'add_score',
          effect_value: 0,
          target: 'active_player',
          duration: 'permanent',
          activation_boundary: 'immediate',
          active_from_turn: 0,
          status: 'rejected',
          is_base_rule: false,
        };
        updatedRules.push(rejectedRule);
      }

      return {
        ...prev,
        rules: updatedRules,
        players: updatedPlayers,
        latestRuling: ruling,
        isInterpretingRule: false,
      };
    });
  };

  // Dismiss AI Ruling modal and advance turn
  const handleDismissRuling = () => {
    setShowRulingModal(false);
    const advanced = advanceTurnAfterAmendment(state);
    setState(advanced);
  };

  // Pass Turn without proposing
  const handlePassTurn = () => {
    setShowProposalComposer(false);
    const advanced = advanceTurnAfterAmendment(state);
    setState(advanced);
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
      {showProposalComposer && state.players[state.activePlayerIndex] && (
        <ProposalComposer
          proposer={state.players[state.activePlayerIndex]}
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
          proposer={state.players[state.activePlayerIndex] || state.players[0]}
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
