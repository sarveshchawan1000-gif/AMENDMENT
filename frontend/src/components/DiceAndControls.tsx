import React, { useState, useEffect } from 'react';
import { GameState } from '../types/game';
import { Dices, ArrowRight, Sparkles, Timer } from 'lucide-react';

interface DiceAndControlsProps {
  state: GameState;
  onRollDice: () => void;
  onOpenProposalComposer: () => void;
  onPassTurn: () => void;
  isRolling: boolean;
  amendmentDeadline?: number | null;
  onTimeout?: () => void;
}

export const DiceAndControls: React.FC<DiceAndControlsProps> = ({
  state,
  onRollDice,
  onOpenProposalComposer,
  onPassTurn,
  isRolling,
  amendmentDeadline,
  onTimeout,
}) => {
  const activePlayer = state.players[state.activePlayerIndex];
  const isEligibleToPropose = state.phase === 'eligible_for_amendment' && state.config.mode === 'live';
  const isWaitingForRoll = state.phase === 'waiting_for_roll';

  const calculateRemaining = () => {
    if (!amendmentDeadline) return 0;
    const targetMs = amendmentDeadline < 1e11 ? amendmentDeadline * 1000 : amendmentDeadline;
    return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
  };

  const [timeLeft, setTimeLeft] = useState<number>(calculateRemaining);

  useEffect(() => {
    if (!amendmentDeadline || !isEligibleToPropose) {
      setTimeLeft(0);
      return;
    }

    const initialRemaining = calculateRemaining();
    setTimeLeft(initialRemaining);
    if (initialRemaining <= 0) {
      onTimeout?.();
      return;
    }

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onTimeout?.();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [amendmentDeadline, isEligibleToPropose, onTimeout]);

  if (!activePlayer) return null;

  return (
    <div
      className="panel"
      style={{
        padding: '18px 22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}
    >
      {/* Player Turn & Current Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: activePlayer.color,
            color: 'var(--accent-contrast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            border: '2px solid var(--accent-contrast)',
          }}
        >
          {activePlayer.avatar}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--text)',
              }}
            >
              {activePlayer.name}&apos;s Turn
            </span>
            {activePlayer.isGemma && (
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  color: 'var(--accent-2)',
                  border: '1px solid var(--accent-2)',
                  fontWeight: 700,
                }}
              >
                Gemma Bot
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {isWaitingForRoll && 'Roll the dice to advance your legislator token.'}
            {isRolling && 'Rolling the assembly dice...'}
            {isEligibleToPropose && 'Cadence window open! You may submit a new amendment.'}
            {state.phase === 'moving' && 'Resolving movement and landing effects...'}
          </p>
        </div>
      </div>

      {/* Dice Face & Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Dice Visual Result Box */}
        {state.currentDiceRoll !== null && (
          <div
            className={isRolling ? 'animate-dice-shake' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
            }}
          >
            <Dices size={24} style={{ color: 'var(--accent)' }} />
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: 'var(--text)',
                  lineHeight: 1,
                }}
              >
                {state.currentDiceRoll}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {state.config.dice} Roll
              </div>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        {isWaitingForRoll && (
          <button
            type="button"
            onClick={onRollDice}
            disabled={isRolling}
            className="btn btn-accent"
            style={{
              padding: '12px 28px',
              fontSize: '0.95rem',
              letterSpacing: '0.06em',
              opacity: isRolling ? 0.7 : 1,
            }}
          >
            <Dices size={18} />
            {isRolling ? 'ROLLING...' : `ROLL ${state.config.dice.toUpperCase()}`}
          </button>
        )}

        {/* Amendment Eligible Action Buttons */}
        {isEligibleToPropose && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Authoritative countdown timer: visible ONLY while opportunity active */}
            {Boolean(amendmentDeadline) && timeLeft > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background:
                    timeLeft <= 10
                      ? 'rgba(239, 68, 68, 0.2)'
                      : timeLeft <= 20
                      ? 'rgba(245, 158, 11, 0.18)'
                      : 'var(--surface-2)',
                  color:
                    timeLeft <= 10
                      ? 'var(--danger)'
                      : timeLeft <= 20
                      ? '#f59e0b'
                      : 'var(--text)',
                  border:
                    timeLeft <= 10
                      ? '1px solid var(--danger)'
                      : timeLeft <= 20
                      ? '1px solid #f59e0b'
                      : '1px solid var(--line)',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              >
                <Timer size={14} style={{ color: timeLeft <= 10 ? 'var(--danger)' : timeLeft <= 20 ? '#f59e0b' : 'var(--accent)' }} />
                <span>{timeLeft}s</span>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenProposalComposer}
              className="btn btn-accent"
              style={{
                padding: '12px 22px',
                fontSize: '0.9rem',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles size={16} />
              PROPOSE AMENDMENT
            </button>

            <button
              type="button"
              onClick={onPassTurn}
              className="btn btn-secondary"
              style={{
                padding: '11px 18px',
                fontSize: '0.85rem',
              }}
            >
              <span>Pass Turn</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
