import React from 'react';
import { GameEventLog } from '../types/game';
import {
  Activity,
  X,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Clock,
  Layers,
} from 'lucide-react';

interface RuleAutopsyModalProps {
  event: GameEventLog | null;
  onClose: () => void;
}

export const RuleAutopsyModal: React.FC<RuleAutopsyModalProps> = ({ event, onClose }) => {
  if (!event) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 110,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-strong)',
          maxWidth: '600px',
          width: '100%',
          padding: '28px',
          boxShadow: 'var(--shadow-elevated)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-burgundy-light)',
                color: 'var(--accent-burgundy)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', fontWeight: 800 }}>
                Rule Autopsy / Causal Record
              </h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Turn {event.turn} • {event.player_name} • Phase: {event.phase.toUpperCase()}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Causal Delta Overview Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {/* Score Delta */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
              Score Transformation
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>
                {event.prior_score} pts
              </span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: event.score_delta > 0 ? 'var(--status-admitted)' : 'var(--text-primary)',
                }}
              >
                {event.resulting_score} pts
              </span>
              {event.score_delta !== 0 && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: event.score_delta > 0 ? 'var(--status-admitted)' : 'var(--status-rejected)',
                  }}
                >
                  ({event.score_delta > 0 ? `+${event.score_delta}` : event.score_delta})
                </span>
              )}
            </div>
          </div>

          {/* Position Delta */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
              Tile Location
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700 }}>
                Tile {event.prior_position}
              </span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-burgundy)' }}>
                Tile {event.resulting_position}
              </span>
            </div>
          </div>
        </div>

        {/* Narrative Description */}
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '12px 16px',
            marginBottom: '20px',
            fontFamily: 'var(--font-editorial)',
            fontSize: '0.92rem',
            fontStyle: 'italic',
            color: 'var(--text-primary)',
          }}
        >
          &ldquo;{event.description}&rdquo;
        </div>

        {/* Breakdown of Every Rule That Contributed */}
        <div style={{ marginBottom: '24px' }}>
          <h4
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '0.9rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={15} />
            Contributing Rules Breakdown ({event.rules_fired.length})
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {event.rules_fired.map((fired, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: fired.is_base_rule ? 'var(--bg-subtle)' : 'var(--accent-gold-subtle)',
                  border: fired.is_base_rule ? '1px dashed var(--border-strong)' : '1px solid var(--accent-gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: fired.is_base_rule ? 'var(--text-muted)' : 'var(--accent-gold)',
                      }}
                    >
                      {fired.rule_id}
                    </span>
                    <strong style={{ fontSize: '0.85rem' }}>{fired.rule_title}</strong>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        background: fired.is_base_rule ? 'var(--border-strong)' : 'var(--accent-gold)',
                        color: '#fff',
                        fontWeight: 700,
                      }}
                    >
                      {fired.is_base_rule ? 'CONSTITUTIONAL BASE' : 'AMENDMENT'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {fired.effect_summary}
                  </p>
                </div>

                {fired.score_delta !== undefined && fired.score_delta !== 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: fired.score_delta > 0 ? 'var(--status-admitted)' : 'var(--status-rejected)',
                    }}
                  >
                    {fired.score_delta > 0 ? `+${fired.score_delta}` : fired.score_delta} pts
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-burgundy)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            Close Autopsy
          </button>
        </div>
      </div>
    </div>
  );
};
