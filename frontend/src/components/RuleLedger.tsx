import React, { useState } from 'react';
import { CompiledRule, RuleStatus } from '../types/game';
import { useTheme } from '../theme/ThemeProvider';
import {
  ScrollText,
  Clock,
  User,
  Code2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface RuleLedgerProps {
  rules: CompiledRule[];
  currentTurn: number;
}

export const RuleLedger: React.FC<RuleLedgerProps> = ({ rules }) => {
  const { theme } = useTheme();
  const [filter, setFilter] = useState<string>('active');
  const [inspectingRule, setInspectingRule] = useState<CompiledRule | null>(null);

  const filteredRules = rules.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const getStatusBadge = (status: RuleStatus) => {
    switch (status) {
      case 'active':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--ok)',
              border: '1px solid var(--ok)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-display)',
            }}
          >
            ACTIVE
          </span>
        );
      case 'pending':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--accent-2)',
              border: '1px solid var(--accent-2)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}
          >
            PENDING (NEXT TURN)
          </span>
        );
      case 'rejected':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}
          >
            REJECTED
          </span>
        );
      case 'expired':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
              border: '1px solid var(--line)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}
          >
            EXPIRED
          </span>
        );
      case 'overridden':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}
          >
            SUPERSEDED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="panel"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Header and Filter Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScrollText size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
              {theme.labels.ledger}
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Deterministic Engine Enforcement Record
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-2)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
          {['active', 'all', 'expired', 'rejected', 'overridden'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: filter === tab ? 'var(--surface)' : 'transparent',
                color: filter === tab ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: filter === tab ? 800 : 600,
                fontSize: '0.72rem',
                fontFamily: 'var(--font-display)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Rules List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '540px', overflowY: 'auto' }}>
        {filteredRules.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontStyle: 'italic',
            }}
          >
            No rules recorded under this filter.
          </div>
        ) : (
          filteredRules.map((rule) => {
            const isBase = rule.is_base_rule;

            return (
              <div
                key={rule.id}
                style={{
                  borderRadius: 'var(--radius)',
                  background: isBase ? 'var(--surface-2)' : 'var(--surface)',
                  border: isBase
                    ? '1px dashed var(--line)'
                    : '1px solid var(--line)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Rule Title Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-2)',
                        color: isBase ? 'var(--accent)' : 'var(--accent-2)',
                        border: isBase ? '1px solid var(--accent)' : '1px solid var(--accent-2)',
                      }}
                    >
                      {rule.id}
                    </span>
                    <h4
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      {rule.title}
                    </h4>
                    {isBase && (
                      <span
                        style={{
                          fontSize: '0.62rem',
                          padding: '1px 6px',
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--line)',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 700,
                          fontFamily: 'var(--font-display)',
                        }}
                      >
                        CONSTITUTIONAL BASE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {getStatusBadge(rule.status)}
                    <button
                      type="button"
                      onClick={() => setInspectingRule(rule)}
                      title="Inspect compiled engine JSON"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Code2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Side-by-side English & Compiled Meaning */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {/* Original Player English */}
                  <div>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px', fontFamily: 'var(--font-display)' }}>
                      Authored English Proposal
                    </div>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.88rem',
                        fontStyle: 'italic',
                        color: 'var(--text)',
                        lineHeight: 1.35,
                      }}
                    >
                      &ldquo;{rule.original_text}&rdquo;
                    </p>
                  </div>

                  {/* Compiled Meaning */}
                  <div>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--accent-2)', fontWeight: 700, marginBottom: '2px', fontFamily: 'var(--font-display)' }}>
                      Compiled Engine Law
                    </div>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text)',
                        lineHeight: 1.35,
                        fontWeight: 600,
                      }}
                    >
                      {rule.readable_meaning}
                    </p>
                  </div>
                </div>

                {/* Metadata Footer: Proposer, Activation, Duration */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    paddingTop: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} />
                    <span>Author: <strong style={{ color: 'var(--text)' }}>{rule.proposer_name}</strong></span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={12} />
                      <span>
                        {rule.activation_boundary === 'immediate'
                          ? 'Enforced immediately'
                          : `Enforced from turn ${rule.active_from_turn}`}
                      </span>
                    </div>

                    <span>•</span>

                    <span>Duration: {rule.duration}</span>
                  </div>
                </div>

                {/* Advisory Loophole or Conflict Note */}
                {rule.loophole_risk && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.72rem',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <AlertTriangle size={12} style={{ color: 'var(--accent-2)', flexShrink: 0 }} />
                    <span>Advisory note: {rule.loophole_risk.note}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Compiled Rule JSON Modal (Secondary Inspection) */}
      {inspectingRule && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
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
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code2 size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>
                  Compiled Rule Schema ({inspectingRule.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRule(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Deterministic JSON output consumed by the game engine. No code execution is permitted.
            </p>

            <pre
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                overflowX: 'auto',
                maxHeight: '340px',
              }}
            >
              {JSON.stringify(inspectingRule, null, 2)}
            </pre>

            <div style={{ textAlign: 'right', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setInspectingRule(null)}
                className="btn btn-accent"
                style={{
                  padding: '8px 18px',
                  fontSize: '0.8rem',
                }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
