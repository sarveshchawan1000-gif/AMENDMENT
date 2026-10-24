import React from 'react';
import { AIRuling, Player } from '../types/game';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
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
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: isInterpreting
            ? '2px solid var(--accent-gold)'
            : isAccepted
            ? '2px solid var(--status-admitted-border)'
            : '2px solid var(--status-rejected-border)',
          maxWidth: '580px',
          width: '100%',
          padding: '30px',
          boxShadow: 'var(--shadow-elevated)',
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
                background: 'var(--accent-gold-subtle)',
                color: 'var(--accent-gold)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: '0 0 16px var(--accent-gold)',
              }}
            >
              <Cpu size={32} />
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.3rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}
            >
              AI Judicial Review in Progress
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
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
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                  Constitutional Tribunal Ruling
                </span>
                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
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
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                Proposed by {proposer.name}
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-editorial)',
                  fontSize: '0.98rem',
                  fontStyle: 'italic',
                  color: 'var(--text-primary)',
                }}
              >
                &ldquo;{ruling.normalized_rule}&rdquo;
              </p>
            </div>

            {/* Admission or Rejection Details */}
            {isAccepted && ruling.compiled_rule && (
              <div
                style={{
                  background: 'var(--status-admitted-bg)',
                  border: '1px solid var(--status-admitted-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <CheckCircle2 size={18} style={{ color: 'var(--status-admitted)' }} />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--status-admitted)' }}>
                    Passed Constitutional Scrutiny
                  </strong>
                </div>

                <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <strong>Engine Law:</strong> {ruling.compiled_rule.readable_meaning}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--status-admitted)',
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
                  background: 'var(--status-rejected-bg)',
                  border: '1px solid var(--status-rejected-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <XCircle size={18} style={{ color: 'var(--status-rejected)' }} />
                  <strong style={{ fontSize: '0.9rem', color: 'var(--status-rejected)' }}>
                    Rejection Grounds
                  </strong>
                </div>

                <p style={{ fontSize: '0.84rem', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {ruling.reason}
                </p>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--status-rejected)',
                    fontWeight: 700,
                    paddingTop: '4px',
                    borderTop: '1px dashed var(--status-rejected-border)',
                  }}
                >
                  ★ Game state remained unaltered. Turn passes without score or movement penalty.
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
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '18px',
                }}
              >
                <AlertTriangle size={14} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
                <span>AI Risk Assessment: {ruling.loophole_risk.note}</span>
              </div>
            )}

            {/* Action Button */}
            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={onDismiss}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 24px',
                  borderRadius: 'var(--radius-full)',
                  background: isAccepted ? 'var(--status-admitted)' : 'var(--text-primary)',
                  color: '#fff',
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-subtle)',
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
