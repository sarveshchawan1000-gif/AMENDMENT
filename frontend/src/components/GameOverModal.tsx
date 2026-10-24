import React, { useEffect } from 'react';
import { CompiledRule, GameEventLog, Player } from '../types/game';
import { rankPlayers } from '../engine/gameEngine';
import confetti from 'canvas-confetti';
import {
  Crown,
  Download,
  RotateCcw,
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
        className="panel"
        style={{
          border: '2px solid var(--accent-2)',
          maxWidth: '620px',
          width: '100%',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        {/* Laurel & Crown */}
        <div
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'var(--surface-2)',
            color: 'var(--accent-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '2px solid var(--accent-2)',
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
            color: 'var(--accent-2)',
            fontWeight: 800,
            marginBottom: '4px',
            fontFamily: 'var(--font-display)',
          }}
        >
          Assembly Victory Declared
        </span>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.85rem',
            fontWeight: 900,
            color: 'var(--text)',
            marginBottom: '8px',
          }}
        >
          {winner.name} Wins AMENDMENT!
        </h2>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            fontStyle: 'italic',
            color: 'var(--text-muted)',
            marginBottom: '20px',
          }}
        >
          By strategic legislation and constitutional prowess, {winner.name} concluded the proceedings with {winner.score} points across {winner.movesPlayed ?? 0} moves ({turnCount} match turns).
        </p>

        {/* Final Standings Table */}
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', fontFamily: 'var(--font-display)' }}>
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
                  background: idx === 0 ? 'var(--surface)' : 'transparent',
                  border: idx === 0 ? '1px solid var(--accent-2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
                    #{idx + 1}
                  </span>
                  <span>{p.avatar}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{p.name}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({p.movesPlayed ?? 0} moves)</span>
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color: idx === 0 ? 'var(--accent-2)' : 'var(--text)' }}>
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
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              padding: '14px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
              <ScrollText size={14} />
              Pivotal Match Amendments ({admittedAmendments.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {admittedAmendments.slice(0, 3).map((r) => (
                <div key={r.id} style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{r.id}: {r.title}</strong> — {r.readable_meaning} (by {r.proposer_name})
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
            className="btn btn-secondary"
            style={{
              padding: '12px 20px',
              fontSize: '0.85rem',
            }}
          >
            <Download size={16} />
            Export Rule Set (JSON)
          </button>

          <button
            type="button"
            onClick={onPlayAgain}
            className="btn btn-accent"
            style={{
              padding: '12px 28px',
              fontSize: '0.95rem',
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
