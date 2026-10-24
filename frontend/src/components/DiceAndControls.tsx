import React, { useState } from 'react';
import { DiceType, GameState } from '../types/game';
import { Dices, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface DiceAndControlsProps {
  state: GameState;
  onRollDice: () => void;
  onOpenProposalComposer: () => void;
  onPassTurn: () => void;
  isRolling: boolean;
}

export const DiceAndControls: React.FC<DiceAndControlsProps> = ({
  state,
  onRollDice,
  onOpenProposalComposer,
  onPassTurn,
  isRolling,
}) => {
  const activePlayer = state.players[state.activePlayerIndex];
  const isEligibleToPropose = state.phase === 'eligible_for_amendment';
  const isWaitingForRoll = state.phase === 'waiting_for_roll';

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '18px 22px',
        boxShadow: 'var(--shadow-card)',
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
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            boxShadow: `0 3px 12px ${activePlayer.color}66`,
            border: '2px solid #fff',
          }}
        >
          {activePlayer.avatar}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              {activePlayer.name}&apos;s Turn
            </span>
            {activePlayer.isGemma && (
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-gold-subtle)',
                  color: 'var(--accent-gold)',
                  fontWeight: 700,
                }}
              >
                Gemma Bot
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
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
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <Dices size={24} style={{ color: 'var(--accent-burgundy)' }} />
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
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
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 28px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--accent-burgundy), #5A1212)',
              color: '#FAF7F2',
              fontFamily: 'var(--font-serif)',
              fontWeight: 800,
              fontSize: '0.95rem',
              letterSpacing: '0.06em',
              border: 'none',
              cursor: isRolling ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(139, 30, 30, 0.3)',
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
            <button
              type="button"
              onClick={onOpenProposalComposer}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, var(--accent-gold), #9A6B22)',
                color: '#FAF7F2',
                fontFamily: 'var(--font-serif)',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.04em',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(194, 139, 56, 0.35)',
              }}
            >
              <Sparkles size={16} />
              PROPOSE AMENDMENT
            </button>

            <button
              type="button"
              onClick={onPassTurn}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '11px 18px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: '1px solid var(--border-strong)',
                cursor: 'pointer',
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
