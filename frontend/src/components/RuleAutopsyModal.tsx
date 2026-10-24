import React from 'react';
import { GameEventLog } from '../types/game';
import {
  Activity,
  X,
  ArrowRight,
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
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 110,
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '600px',
          width: '100%',
          padding: '28px',
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
                background: 'var(--surface-2)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
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
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Score Transformation
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                {event.prior_score} pts
              </span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: event.score_delta > 0 ? 'var(--ok)' : 'var(--text)',
                }}
              >
                {event.resulting_score} pts
              </span>
              {event.score_delta !== 0 && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: event.score_delta > 0 ? 'var(--ok)' : 'var(--danger)',
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
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Tile Location
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                Tile {event.prior_position}
              </span>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
                Tile {event.resulting_position}
              </span>
            </div>
          </div>
        </div>

        {/* Narrative Description */}
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            padding: '12px 16px',
            marginBottom: '20px',
            fontFamily: 'var(--font-body)',
            fontSize: '0.92rem',
            fontStyle: 'italic',
            color: 'var(--text)',
          }}
        >
          &ldquo;{event.description}&rdquo;
        </div>

        {/* Breakdown of Every Rule That Contributed */}
        <div style={{ marginBottom: '24px' }}>
          <h4
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.9rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
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
                  background: 'var(--surface-2)',
                  border: fired.is_base_rule ? '1px dashed var(--line)' : '1px solid var(--accent-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: fired.is_base_rule ? 'var(--text-muted)' : 'var(--accent-2)',
                      }}
                    >
                      {fired.rule_id}
                    </span>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{fired.rule_title}</strong>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        color: fired.is_base_rule ? 'var(--text-muted)' : 'var(--accent-2)',
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      {fired.is_base_rule ? 'BASE RULE' : 'AMENDMENT'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {fired.effect_summary}
                  </p>
                </div>

                {fired.score_delta !== undefined && fired.score_delta !== 0 && (
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: fired.score_delta > 0 ? 'var(--ok)' : 'var(--danger)',
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
            className="btn btn-accent"
            style={{
              padding: '8px 20px',
              fontSize: '0.82rem',
            }}
          >
            Close Autopsy
          </button>
        </div>
      </div>
    </div>
  );
};
