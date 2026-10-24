import React, { useEffect } from 'react';
import { CompiledRule, GameEventLog, Player } from '../types/game';
import { rankPlayers } from '../engine/gameEngine';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Crown,
  Download,
  RotateCcw,
  Sparkles,
  ScrollText,
} from 'lucide-react';

interface GameOverModalProps {
  winner: Player;
  players: Player[];
  rules: CompiledRule[];
  events: GameEventLog[];
  turnCount: number;
  onPlayAgain: () => void;
  onExportRulebook: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  players,
  rules,
  events,
  turnCount,
  onPlayAgain,
  onExportRulebook,
}) => {
  const ranked = rankPlayers(players);
  const admittedAmendments = rules.filter((r) => !r.is_base_rule && r.status === 'active');

  useEffect(() => {
    // Fire celebratory confetti!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 120,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '2px solid var(--accent-gold)',
          maxWidth: '620px',
          width: '100%',
          padding: '32px',
          boxShadow: 'var(--shadow-elevated)',
          textAlign: 'center',
        }}
      >
        {/* Laurel & Crown */}
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'var(--accent-gold-subtle)',
            color: 'var(--accent-gold)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '2px solid var(--accent-gold)',
          }}
        >
          <Crown size={36} />
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--accent-gold)',
            fontWeight: 800,
            marginBottom: '4px',
          }}
        >
          Assembly Victory Declared
        </span>

        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '1.85rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          {winner.name} Wins AMENDMENT!
        </h2>

        <p
          style={{
            fontFamily: 'var(--font-editorial)',
            fontSize: '1rem',
            fontStyle: 'italic',
            color: 'var(--text-secondary)',
            marginBottom: '20px',
          }}
        >
          By strategic legislation and constitutional prowess, {winner.name} concluded the proceedings with {winner.score} points across {turnCount} turns.
        </p>

        {/* Final Standings Table */}
        <div
          style={{
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Final Chamber Standings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ranked.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: idx === 0 ? 'var(--bg-surface)' : 'transparent',
                  border: idx === 0 ? '1px solid var(--accent-gold)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 800 }}>
                    #{idx + 1}
                  </span>
                  <span>{p.avatar}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{p.name}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem' }}>
                  {p.score} pts
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pivotal Enacted Amendments */}
        {admittedAmendments.length > 0 && (
          <div
            style={{
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              padding: '14px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-burgundy)', marginBottom: '8px' }}>
              <ScrollText size={14} />
              Pivotal Match Amendments ({admittedAmendments.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {admittedAmendments.slice(0, 3).map((r) => (
                <div key={r.id} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{r.id}: {r.title}</strong> — {r.readable_meaning} (by {r.proposer_name})
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onExportRulebook}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Download size={16} />
            Export Rule Set (JSON)
          </button>

          <button
            type="button"
            onClick={onPlayAgain}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 28px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, var(--accent-burgundy), #5A1212)',
              color: '#FAF7F2',
              fontFamily: 'var(--font-serif)',
              fontSize: '0.95rem',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(139, 30, 30, 0.35)',
            }}
          >
            <RotateCcw size={16} />
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
};
