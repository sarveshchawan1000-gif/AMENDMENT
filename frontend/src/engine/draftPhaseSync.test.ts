import { describe, it, expect } from 'vitest';

export interface GameSyncState {
  phase: 'setup' | 'draft_stage' | 'waiting_for_roll' | 'eligible_for_amendment' | 'game_over';
  winner: string | null;
  activePlayerIndex: number;
  turnCount: number;
  players: Array<{ id: string; name: string; score: number; position: number }>;
}

export interface BackendSyncState {
  phase: string;
  winner: string | null;
  current_player: number;
  turn: number;
  amendment_phase?: { active: boolean; deadline?: number | null; player_id?: string | null };
  players: Array<{ id: string; score: number; position: number }>;
}

/**
 * Pure reducer mirroring the exact phase synchronization logic in App.tsx
 */
export function syncGameStateWithBackend(
  prev: GameSyncState,
  backendState: BackendSyncState,
  isDraftFinalized: boolean,
): GameSyncState {
  const isPhaseActive = Boolean(backendState.amendment_phase?.active);

  // Finished game always transitions to game_over
  if (backendState.phase === 'finished') {
    return {
      ...prev,
      phase: 'game_over',
      winner: prev.players.find((p) => p.id === backendState.winner)?.id ?? null,
    };
  }

  // In setup screen, do not transition phase
  if (prev.phase === 'setup') {
    return prev;
  }

  // Draft Mode preservation:
  // If backend is in drafting or frontend is in draft_stage, and the draft has not yet been explicitly finalized:
  if ((backendState.phase === 'drafting' || prev.phase === 'draft_stage') && !isDraftFinalized) {
    return {
      ...prev,
      phase: 'draft_stage',
    };
  }

  // Active gameplay phase synchronization:
  return {
    ...prev,
    players: prev.players.map((p) => {
      const bp = backendState.players.find((candidate) => candidate.id === p.id);
      return bp ? { ...p, score: bp.score, position: bp.position } : p;
    }),
    activePlayerIndex: backendState.current_player,
    turnCount: backendState.turn,
    phase: isPhaseActive ? 'eligible_for_amendment' : 'waiting_for_roll',
  };
}

describe('Draft Mode Phase Synchronization', () => {
  const initialFrontendState: GameSyncState = {
    phase: 'draft_stage',
    winner: null,
    activePlayerIndex: 0,
    turnCount: 1,
    players: [
      { id: 'P1', name: 'Alice', score: 0, position: 0 },
      { id: 'P2', name: 'Gemma', score: 0, position: 0 },
    ],
  };

  const draftingBackendState: BackendSyncState = {
    phase: 'drafting',
    winner: null,
    current_player: 0,
    turn: 1,
    players: [
      { id: 'P1', score: 0, position: 0 },
      { id: 'P2', score: 0, position: 0 },
    ],
  };

  it('keeps frontend phase as draft_stage when polling during drafting', () => {
    const isDraftFinalized = false;
    const nextState = syncGameStateWithBackend(
      initialFrontendState,
      draftingBackendState,
      isDraftFinalized,
    );

    expect(nextState.phase).toBe('draft_stage');
  });

  it('does not allow repeated ordinary polling ticks to transition into waiting_for_roll prematurely', () => {
    let currentState = initialFrontendState;
    const isDraftFinalized = false;

    // Simulate 10 periodic polling ticks (e.g. 10 seconds of drafting)
    for (let tick = 0; tick < 10; tick++) {
      currentState = syncGameStateWithBackend(
        currentState,
        draftingBackendState,
        isDraftFinalized,
      );
      expect(currentState.phase).toBe('draft_stage');
    }
  });

  it('transitions to game_over if backend finishes even while drafting', () => {
    const finishedBackend: BackendSyncState = {
      ...draftingBackendState,
      phase: 'finished',
      winner: 'P1',
    };

    const nextState = syncGameStateWithBackend(
      initialFrontendState,
      finishedBackend,
      false,
    );

    expect(nextState.phase).toBe('game_over');
    expect(nextState.winner).toBe('P1');
  });

  it('only transitions to active gameplay when draft is explicitly finalized', () => {
    // 1. Before finalization: stays in draft_stage
    expect(
      syncGameStateWithBackend(initialFrontendState, draftingBackendState, false).phase,
    ).toBe('draft_stage');

    // 2. Draft is finalized by user clicking Start Match
    const finalizedFrontendState: GameSyncState = {
      ...initialFrontendState,
      phase: 'waiting_for_roll',
    };
    const isDraftFinalized = true;

    // 3. Backend transitions to playing
    const playingBackend: BackendSyncState = {
      ...draftingBackendState,
      phase: 'playing',
    };

    const activeState = syncGameStateWithBackend(
      finalizedFrontendState,
      playingBackend,
      isDraftFinalized,
    );

    expect(activeState.phase).toBe('waiting_for_roll');
  });

  it('preserves active amendment phase during gameplay', () => {
    const gameplayState: GameSyncState = {
      ...initialFrontendState,
      phase: 'waiting_for_roll',
    };

    const amendmentActiveBackend: BackendSyncState = {
      ...draftingBackendState,
      phase: 'playing',
      amendment_phase: { active: true, player_id: 'P1', deadline: Date.now() + 60000 },
    };

    const nextState = syncGameStateWithBackend(
      gameplayState,
      amendmentActiveBackend,
      true, // draft finalized
    );

    expect(nextState.phase).toBe('eligible_for_amendment');
  });
});
