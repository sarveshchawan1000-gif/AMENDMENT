import React, { useState } from 'react';
import { Player } from '../types/game';
import { STARTER_PROPOSALS } from '../data/rulebooks';
import { useTheme } from '../theme/ThemeProvider';
import {
  Send,
  X,
  ShieldCheck,
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
  const { theme } = useTheme();
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
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 90,
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '640px',
          width: '100%',
          padding: '28px',
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
                color: 'var(--accent-contrast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                border: '2px solid var(--accent-contrast)',
              }}
            >
              {proposer.avatar}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: 'var(--text)',
                  }}
                >
                  {theme.labels.amendTitle}
                </h3>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    color: 'var(--accent-2)',
                    border: '1px solid var(--accent-2)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Turn {currentTurn}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Proposing Legislator: <strong style={{ color: 'var(--text)' }}>{proposer.name}</strong>
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
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line)',
            padding: '10px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.78rem',
            color: 'var(--text)',
          }}
        >
          <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.95rem',
                resize: 'none',
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                fontSize: '0.72rem',
                color: charsRemaining < 20 ? 'var(--danger)' : 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              {charsRemaining} characters left
            </div>
          </div>

          {/* Starter Example Chips */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
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
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  &ldquo;{suggestion}&rdquo;
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isInterpreting}
              className="btn btn-secondary"
              style={{
                padding: '8px 16px',
                fontSize: '0.82rem',
              }}
            >
              Pass / Skip
            </button>

            <button
              type="submit"
              disabled={!isValid || isInterpreting}
              className="btn btn-accent"
              style={{
                padding: '10px 24px',
                fontSize: '0.9rem',
                letterSpacing: '0.04em',
                opacity: isValid && !isInterpreting ? 1 : 0.6,
                cursor: isValid && !isInterpreting ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={15} />
              {isInterpreting ? 'AI DELIBERATING...' : theme.labels.amendSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
