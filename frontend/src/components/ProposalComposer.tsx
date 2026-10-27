import React, { useState, useEffect } from 'react';
import { Player } from '../types/game';
import { STARTER_PROPOSALS, CANONICAL_STARTER_SUGGESTIONS } from '../data/rulebooks';
import { fetchPlayerSuggestions, PredefinedSuggestion } from '../services/gameApi';
import { useTheme } from '../theme/ThemeProvider';
import {
  Send,
  X,
  ShieldCheck,
  Zap,
  BookOpen,
  Timer,
  AlertTriangle,
} from 'lucide-react';

interface ProposalComposerProps {
  proposer: Player;
  currentTurn: number;
  gameId?: string;
  deadline?: number | null;
  onSubmitProposal: (text: string) => void;
  onSubmitPredefined?: (amendmentId: string) => void;
  onCancel: () => void;
  onTimeout?: () => void;
  isInterpreting: boolean;
}

const MAX_CHAR_LIMIT = 140;

export const ProposalComposer: React.FC<ProposalComposerProps> = ({
  proposer,
  currentTurn,
  gameId,
  deadline,
  onSubmitProposal,
  onSubmitPredefined,
  onCancel,
  onTimeout,
  isInterpreting,
}) => {
  const { theme } = useTheme();
  const [proposalText, setProposalText] = useState('');
  const [suggestions, setSuggestions] = useState<PredefinedSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const calculateRemaining = () => {
    if (!deadline) return 0;
    const targetMs = deadline < 1e11 ? deadline * 1000 : deadline;
    return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
  };

  const [timeLeft, setTimeLeft] = useState<number>(calculateRemaining);

  useEffect(() => {
    if (!deadline) {
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
  }, [deadline, onTimeout]);

  useEffect(() => {
    let isMounted = true;
    if (gameId) {
      setIsLoadingSuggestions(true);
      fetchPlayerSuggestions(gameId, proposer.id)
        .then((res) => {
          if (isMounted && res.suggestions && res.suggestions.length > 0) {
            setSuggestions(res.suggestions);
          }
        })
        .catch((err) => {
          console.warn('Could not fetch backend predefined suggestions:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingSuggestions(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [gameId, proposer.id, currentTurn]);

  const isBusy = isInterpreting || submittingId !== null;

  const charsRemaining = MAX_CHAR_LIMIT - proposalText.length;
  const isValid = proposalText.trim().length >= 5 && charsRemaining >= 0;

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid && !isBusy) {
      onSubmitProposal(proposalText.trim());
    }
  };

  const handlePredefinedClick = (amendmentId: string, fallbackText: string) => {
    if (isBusy) return;
    setSubmittingId(amendmentId);
    if (onSubmitPredefined) {
      onSubmitPredefined(amendmentId);
    } else {
      onSubmitProposal(fallbackText);
    }
  };

  const handleSelectStarterFallback = (text: string) => {
    setProposalText(text);
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'scoring':
        return { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--ok)' };
      case 'movement':
        return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: 'var(--accent)' };
      case 'catch_up':
        return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' };
      case 'disruption':
        return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--danger)' };
      case 'endgame':
        return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' };
      default:
        return { bg: 'var(--surface)', border: 'var(--line)', text: 'var(--text-muted)' };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 90,
        overflowY: 'auto',
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '680px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 28px',
          position: 'relative',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
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
                    margin: 0,
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

                {/* Visible 60-Second Countdown: active only while opportunity open */}
                {Boolean(deadline) && timeLeft > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 10px',
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Timer size={13} style={{ color: timeLeft <= 10 ? 'var(--danger)' : timeLeft <= 20 ? '#f59e0b' : 'var(--accent)' }} />
                    {timeLeft}s remaining
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Proposing Legislator: <strong style={{ color: 'var(--text)' }}>{proposer.name}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              padding: '4px',
            }}
            title="Pass / Skip amendment"
          >
            <X size={20} />
          </button>
        </div>

        {/* Low-Time Notification Banner: only visible while active and low time */}
        {Boolean(deadline) && timeLeft > 0 && timeLeft <= 15 ? (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid #f59e0b',
              color: '#f59e0b',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            <Timer size={14} />
            Time running low! Select a predefined amendment or submit before the countdown reaches zero.
          </div>
        ) : null}

        {/* SECTION 1: Predefined Amendment Suggestions */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              <BookOpen size={14} style={{ color: 'var(--accent)' }} />
              Predefined Amendments (Instant • Zero AI Delay):
            </div>
            {isLoadingSuggestions && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Loading suggestions...</span>
            )}
          </div>

          {(() => {
            const displayedSuggestions = suggestions.length > 0 ? suggestions : CANONICAL_STARTER_SUGGESTIONS;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                {displayedSuggestions.map((s) => {
                  const badgeStyle = getCategoryColor(s.category);
                  const isSelected = submittingId === s.id;

                  return (
                    <div
                      key={s.id}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: badgeStyle.bg,
                              border: `1px solid ${badgeStyle.border}`,
                              color: badgeStyle.text,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {s.category.replace('_', ' ')}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            {s.id}
                          </span>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                            {s.title}
                          </strong>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.35 }}>
                          {s.description}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePredefinedClick(s.id, s.description)}
                        disabled={isBusy}
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          borderColor: isSelected ? 'var(--ok)' : undefined,
                          color: isSelected ? 'var(--ok)' : undefined,
                        }}
                      >
                        <Zap size={13} style={{ color: 'var(--accent)' }} />
                        {isSelected ? 'Enacting...' : 'Enact'}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* SECTION 2: Custom Amendment Proposal (AI Court Pipeline) */}
        <div
          style={{
            borderTop: '1px dashed var(--line)',
            paddingTop: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: '8px' }}>
            <ShieldCheck size={14} style={{ color: 'var(--ok)' }} />
            Or Draft a Custom Amendment (AI Court Deliberation):
          </div>

          <form onSubmit={handleSubmitCustom}>
            <div style={{ position: 'relative', marginBottom: '6px' }}>
              <textarea
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                placeholder="e.g. When I land on a prime tile, give me 2 points."
                maxLength={MAX_CHAR_LIMIT}
                disabled={isBusy}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.9rem',
                  resize: 'none',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  fontSize: '0.7rem',
                  color: charsRemaining < 20 ? 'var(--danger)' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {charsRemaining} characters left
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={onCancel}
                disabled={isBusy}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.8rem',
                }}
              >
                Pass / Skip
              </button>

              <button
                type="submit"
                disabled={!isValid || isBusy}
                className="btn btn-accent"
                style={{
                  padding: '8px 20px',
                  fontSize: '0.84rem',
                  letterSpacing: '0.04em',
                  opacity: isValid && !isBusy ? 1 : 0.6,
                  cursor: isValid && !isBusy ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
                {isInterpreting ? 'AI DELIBERATING...' : 'Submit Custom to AI Court'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
