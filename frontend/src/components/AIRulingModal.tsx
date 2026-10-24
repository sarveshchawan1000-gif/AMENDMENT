import React from 'react';
import { AIRuling, Player } from '../types/game';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Cpu,
} from 'lucide-react';

interface AIRulingModalProps {
  ruling: AIRuling | null;
  proposer: Player;
  isInterpreting: boolean;
  onDismiss: () => void;
}

export const AIRulingModal: React.FC<AIRulingModalProps> = ({
  ruling,
  proposer,
  isInterpreting,
  onDismiss,
}) => {
  if (!ruling && !isInterpreting) return null;

  const isAccepted = ruling?.status === 'accepted';

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
        zIndex: 100,
      }}
    >
      <div
        className="panel"
        style={{
          border: isInterpreting
            ? '2px solid var(--accent)'
            : isAccepted
            ? '2px solid var(--ok)'
            : '2px solid var(--danger)',
          maxWidth: '580px',
          width: '100%',
          padding: '30px',
          position: 'relative',
        }}
      >
        {/* INTERPRETING / DELIBERATION STATE */}
        {isInterpreting && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              className="animate-deliberation"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--surface-2)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                border: '1px solid var(--accent)',
              }}
            >
              <Cpu size={32} />
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.3rem',
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: '8px',
              }}
            >
              AI Judicial Review in Progress
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', fontFamily: 'var(--font-body)' }}>
              Gemma model is interpreting the proposal, mapping trigger/conditions, and verifying deterministic engine limits...
            </p>
          </div>
        )}

        {/* COMPLETED RULING STATE */}
        {!isInterpreting && ruling && (
          <div>
            {/* Header with Stamp */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                  Constitutional Tribunal Ruling
                </span>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text)',
                  }}
                >
                  {isAccepted ? 'Amendment Enacted' : 'Proposal Rejected'}
                </h3>
              </div>

              {/* Legal Stamp */}
              <div className={`stamp ${isAccepted ? 'stamp-admitted' : 'stamp-rejected'}`}>
                {isAccepted ? '✓ ADMITTED' : '✕ REJECTED'}
              </div>
            </div>

            {/* Proposal Context Box */}
            <div
              style={{
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px', fontFamily: 'var(--font-display)' }}>
                Proposed by {proposer.name}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.98rem',
                  fontStyle: 'italic',
                  color: 'var(--text)',
                }}
              >
                &ldquo;{ruling.normalized_rule}&rdquo;
              </p>
            </div>

            {/* Admission or Rejection Details */}
            {isAccepted && ruling.compiled_rule && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--ok)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <CheckCircle2 size={18} style={{ color: 'var(--ok)' }} />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ok)', fontFamily: 'var(--font-display)' }}>
                    Passed Constitutional Scrutiny
                  </strong>
                </div>

                <div style={{ fontSize: '0.84rem', color: 'var(--text)', marginBottom: '8px' }}>
                  <strong>Engine Law:</strong> {ruling.compiled_rule.readable_meaning}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--ok)',
                    fontWeight: 700,
                  }}
                >
                  <Clock size={14} />
                  <span>
                    Takes effect at next-turn boundary (Turn {ruling.compiled_rule.active_from_turn}).
                  </span>
                </div>
              </div>
            )}

            {!isAccepted && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <XCircle size={18} style={{ color: 'var(--danger)' }} />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>
                    Rejection Grounds
                  </strong>
                </div>

                <p style={{ fontSize: '0.84rem', color: 'var(--text)', marginBottom: '8px' }}>
                  {ruling.reason}
                </p>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--danger)',
                    fontWeight: 700,
                    paddingTop: '4px',
                    borderTop: '1px dashed var(--danger)',
                  }}
                >
                  ★ Game state remained unaltered. Turn passes without penalty.
                </div>
              </div>
            )}

            {/* Advisory loop or conflict note */}
            {ruling.loophole_risk && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  marginBottom: '18px',
                }}
              >
                <AlertTriangle size={14} style={{ color: 'var(--accent-2)', flexShrink: 0 }} />
                <span>AI Risk Assessment: {ruling.loophole_risk.note}</span>
              </div>
            )}

            {/* Action Button */}
            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={onDismiss}
                className="btn btn-accent"
                style={{
                  padding: '10px 24px',
                  fontSize: '0.88rem',
                }}
              >
                <span>Continue Match</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
