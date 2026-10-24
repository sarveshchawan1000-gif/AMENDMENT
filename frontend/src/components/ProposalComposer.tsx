import React, { useState } from 'react';
import { Player } from '../types/game';
import { STARTER_PROPOSALS } from '../data/rulebooks';
import {
  Sparkles,
  Send,
  X,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Clock,
  ThumbsUp,
} from 'lucide-react';

interface ProposalComposerProps {
  proposer: Player;
  currentTurn: number;
  onSubmitProposal: (text: string) => void;
  onCancel: () => void;
  isInterpreting: boolean;
}

const MAX_CHAR_LIMIT = 140;

export const ProposalComposer: React.FC<ProposalComposerProps> = ({
  proposer,
  currentTurn,
  onSubmitProposal,
  onCancel,
  isInterpreting,
}) => {
  const [proposalText, setProposalText] = useState('');

  const charsRemaining = MAX_CHAR_LIMIT - proposalText.length;
  const isValid = proposalText.trim().length >= 5 && charsRemaining >= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !isInterpreting) {
      onSubmitProposal(proposalText.trim());
    }
  };

  const handleSelectStarter = (text: string) => {
    setProposalText(text);
  };

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
        zIndex: 90,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-strong)',
          maxWidth: '640px',
          width: '100%',
          padding: '28px',
          boxShadow: 'var(--shadow-elevated)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: proposer.color,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                border: '2px solid #fff',
              }}
            >
              {proposer.avatar}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                  }}
                >
                  Draft an Amendment
                </h3>
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
                  Turn {currentTurn}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Proposing Legislator: <strong>{proposer.name}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isInterpreting}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isInterpreting ? 'not-allowed' : 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Constitutional Guardrails Reminder Banner */}
        <div
          style={{
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '10px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          <ShieldCheck size={18} style={{ color: 'var(--accent-burgundy)', flexShrink: 0 }} />
          <div>
            <strong>No player voting.</strong> You may propose rules that benefit your own score.
            The AI judicial pipeline checks your proposal against bounded engine vocabulary (±5 points limit).
            Accepted rules take effect at the <strong>next-turn boundary</strong>.
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <textarea
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              placeholder="e.g. When I land on a prime tile, give me 2 points."
              maxLength={MAX_CHAR_LIMIT}
              disabled={isInterpreting}
              rows={3}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.95rem',
                resize: 'none',
                outline: 'none',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                fontSize: '0.72rem',
                color: charsRemaining < 20 ? 'var(--status-rejected)' : 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              {charsRemaining} characters left
            </div>
          </div>

          {/* Starter Example Chips */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Starter Suggestions (click to populate):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {STARTER_PROPOSALS.slice(0, 4).map((suggestion, sIdx) => (
                <button
                  key={sIdx}
                  type="button"
                  onClick={() => handleSelectStarter(suggestion)}
                  disabled={isInterpreting}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isInterpreting}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Pass / Skip Amendment
            </button>

            <button
              type="submit"
              disabled={!isValid || isInterpreting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                borderRadius: 'var(--radius-full)',
                background: isValid && !isInterpreting
                  ? 'linear-gradient(135deg, var(--accent-burgundy), #5A1212)'
                  : 'var(--border-strong)',
                color: '#FAF7F2',
                fontFamily: 'var(--font-serif)',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.04em',
                border: 'none',
                cursor: isValid && !isInterpreting ? 'pointer' : 'not-allowed',
                boxShadow: isValid && !isInterpreting ? '0 4px 14px rgba(139, 30, 30, 0.3)' : 'none',
              }}
            >
              <Send size={15} />
              {isInterpreting ? 'AI DELIBERATING...' : 'SUBMIT PROPOSAL'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
