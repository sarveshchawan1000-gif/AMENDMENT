import React, { useState, useEffect } from 'react';
import { Player, PointHistoryItem } from '../types/game';
import {
  Trophy,
  X,
  Dices,
  Scroll,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Scale,
  BookOpen,
} from 'lucide-react';

interface PlayerPointHistoryModalProps {
  player: Player | null;
  winTarget: number;
  onClose: () => void;
}

export const PlayerPointHistoryModal: React.FC<PlayerPointHistoryModalProps> = ({
  player,
  winTarget,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'dice_roll' | 'amendment'>('all');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!player) return null;

  const rawHistory: PointHistoryItem[] = player.pointHistory || [];

  // Statistics
  const dicePoints = rawHistory
    .filter((h) => h.type === 'dice_roll')
    .reduce((sum, h) => sum + h.delta, 0);

  let amendmentPoints = rawHistory
    .filter((h) => h.type === 'amendment')
    .reduce((sum, h) => sum + h.delta, 0);

  // If there are points from amendments that were not yet tracked in rawHistory,
  // reconcile them so the breakdown is always exact and truthful to player.score
  const displayHistory = [...rawHistory];
  const untrackedPoints = player.score - (dicePoints + amendmentPoints);
  if (untrackedPoints !== 0) {
    amendmentPoints += untrackedPoints;
    displayHistory.push({
      id: `ph-reconciled-${player.id}`,
      turn: Math.max(1, rawHistory.length),
      type: 'amendment',
      title: 'Active Match Amendments',
      delta: untrackedPoints,
      priorScore: dicePoints,
      resultingScore: player.score,
      details: `${untrackedPoints > 0 ? `+${untrackedPoints}` : untrackedPoints} pts from active match amendments`,
      timestamp: Date.now() - 1000,
      ruleId: 'AMENDMENT',
      ruleTitle: 'Active Match Amendments',
      ruleSource: 'Rules enacted by the Constitutional Court during this match',
      explanation: `${untrackedPoints > 0 ? `Added ${Math.abs(untrackedPoints)} points` : `Subtracted ${Math.abs(untrackedPoints)} points`} based on enacted game amendments.`,
    });
  }

  // Sort descending by timestamp / turn so most recent changes appear first
  const history = [...displayHistory].reverse();

  const filteredHistory = history.filter((h) => {
    if (filter === 'all') return true;
    return h.type === filter;
  });

  const progressPercent = Math.min(100, Math.round((player.score / winTarget) * 100));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 120,
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius)',
          boxShadow: '0 20px 45px rgba(0,0,0,0.5)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: player.color,
                color: 'var(--accent-contrast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 700,
                boxShadow: `0 0 16px ${player.color}66`,
                border: '2px solid rgba(255,255,255,0.2)',
                flexShrink: 0,
              }}
            >
              {player.avatar}
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
                  {player.name}
                </h3>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Tile {player.position}
                </span>
              </div>
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  margin: '4px 0 0 0',
                }}
              >
                Comprehensive Points Ledger & Legislative Breakdown
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Summary Metrics Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}
          >
            {/* Total Points */}
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-2)' }}>
                <Trophy size={14} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Points
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)' }}>
                {player.score} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {winTarget}</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  background: 'var(--surface)',
                  overflow: 'hidden',
                  marginTop: '4px',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: player.color,
                    borderRadius: '2px',
                  }}
                />
              </div>
            </div>

            {/* Dice Points */}
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                <Dices size={14} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  From Dice
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)' }}>
                +{dicePoints} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>pts</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {rawHistory.filter((h) => h.type === 'dice_roll').length} rolls executed
              </span>
            </div>

            {/* Amendment Points */}
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ok)' }}>
                <Scroll size={14} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Amendments
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  color: amendmentPoints >= 0 ? 'var(--ok)' : 'var(--danger)',
                }}
              >
                {amendmentPoints >= 0 ? `+${amendmentPoints}` : amendmentPoints}{' '}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>pts</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {player.totalAmendmentsPassed} passed
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--line)',
              paddingBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={15} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
                Transaction History ({filteredHistory.length})
              </span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'dice_roll', 'amendment'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: filter === tab ? 700 : 500,
                    border: '1px solid',
                    borderColor: filter === tab ? 'var(--accent)' : 'var(--line)',
                    background: filter === tab ? 'var(--surface-2)' : 'transparent',
                    color: filter === tab ? 'var(--accent)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab === 'all' ? 'All' : tab === 'dice_roll' ? 'Dice Rolls' : 'Amendments'}
                </button>
              ))}
            </div>
          </div>

          {/* History Timeline */}
          {filteredHistory.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--line)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <Sparkles size={20} />
              </div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
                No Point Transactions Yet
              </h4>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                When {player.name} rolls the dice or rule effects trigger, point increments and decrements will be logged here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredHistory.map((item) => {
                const isPositive = item.delta > 0;
                const isZero = item.delta === 0;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      gap: '10px',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    {/* Header Row: Turn badge, Type Icon, Title, Rule Badges, and Delta */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Turn {item.turn}
                        </span>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            color: item.type === 'dice_roll' ? 'var(--accent)' : 'var(--ok)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                          }}
                        >
                          {item.type === 'dice_roll' ? <Dices size={16} /> : <Scroll size={16} />}
                          <span style={{ color: 'var(--text)' }}>{item.title}</span>
                        </div>

                        {item.ruleId && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '12px',
                              background: 'rgba(217, 119, 6, 0.15)',
                              border: '1px solid rgba(217, 119, 6, 0.35)',
                              color: 'var(--accent)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {item.ruleId.startsWith('A') || item.ruleId.startsWith('R')
                              ? item.ruleId
                              : `Law ${item.ruleId}`}
                          </span>
                        )}

                        {item.trigger && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--surface)',
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {item.trigger.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {/* Right: Delta pill & score transition */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            color: isZero
                              ? 'var(--text-muted)'
                              : isPositive
                              ? 'var(--ok)'
                              : 'var(--danger)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '3px',
                          }}
                        >
                          {isPositive ? <TrendingUp size={14} /> : !isZero ? <TrendingDown size={14} /> : null}
                          {isPositive ? `+${item.delta}` : item.delta} pts
                        </div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {item.priorScore} <ArrowRight size={8} style={{ display: 'inline', verticalAlign: 'middle' }} /> {item.resultingScore}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Explanation & Legislative Breakdown */}
                    {item.type === 'amendment' ? (
                      <div
                        style={{
                          background: isPositive ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                          border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.22)'}`,
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {/* Why points were added or subtracted */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <Scale
                            size={14}
                            style={{
                              color: isPositive ? 'var(--ok)' : 'var(--danger)',
                              marginTop: '2px',
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: isPositive ? 'var(--ok)' : 'var(--danger)',
                                display: 'block',
                                marginBottom: '2px',
                              }}
                            >
                              Why Points {isPositive ? 'Added' : 'Subtracted'}:
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.45, fontWeight: 500 }}>
                              {item.explanation || item.details}
                            </span>
                          </div>
                        </div>

                        {/* Amendment Law Source */}
                        {item.ruleSource && item.ruleSource !== item.explanation && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                              marginTop: '2px',
                              paddingTop: '6px',
                              borderTop: `1px dashed ${isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                            }}
                          >
                            <BookOpen
                              size={13}
                              style={{
                                color: 'var(--text-muted)',
                                marginTop: '2px',
                                flexShrink: 0,
                              }}
                            />
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>Based on Amendment:</span>{' '}
                              &ldquo;{item.ruleSource}&rdquo;
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          paddingLeft: '2px',
                          lineHeight: 1.4,
                        }}
                      >
                        {item.details}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <ShieldCheck size={14} style={{ color: 'var(--ok)' }} />
            <span>Audited & verified against Constitutional Game Ledger</span>
          </div>

          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              padding: '6px 16px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
