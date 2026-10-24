import React, { useState } from 'react';
import { CompiledRule, RuleStatus } from '../types/game';
import {
  ScrollText,
  ShieldCheck,
  Clock,
  User,
  Code2,
  FileCheck2,
  AlertTriangle,
  ExternalLink,
  X,
} from 'lucide-react';

interface RuleLedgerProps {
  rules: CompiledRule[];
  currentTurn: number;
}

export const RuleLedger: React.FC<RuleLedgerProps> = ({ rules, currentTurn }) => {
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
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-admitted-bg)',
              color: 'var(--status-admitted)',
              border: '1px solid var(--status-admitted-border)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
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
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-active-bg)',
              color: 'var(--status-active)',
              border: '1px solid var(--status-active)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
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
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-rejected-bg)',
              color: 'var(--status-rejected)',
              border: '1px solid var(--status-rejected-border)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
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
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-expired-bg)',
              color: 'var(--status-expired)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
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
              borderRadius: 'var(--radius-full)',
              background: 'var(--status-overridden-bg)',
              color: 'var(--status-overridden)',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
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
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        boxShadow: 'var(--shadow-card)',
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
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ScrollText size={20} style={{ color: 'var(--accent-burgundy)' }} />
          <div>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 800 }}>
              The Rule Ledger
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Deterministic Engine Enforcement Record
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-subtle)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
          {['active', 'all', 'expired', 'rejected', 'overridden'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: filter === tab ? 'var(--bg-surface)' : 'transparent',
                color: filter === tab ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
                fontWeight: filter === tab ? 800 : 600,
                fontSize: '0.72rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
                boxShadow: filter === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
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
                  borderRadius: 'var(--radius-md)',
                  background: isBase ? 'var(--bg-subtle)' : 'var(--bg-surface-elevated)',
                  border: isBase
                    ? '1px dashed var(--border-strong)'
                    : '1px solid var(--border-subtle)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: 'var(--shadow-subtle)',
                }}
              >
                {/* Rule Title Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: isBase ? 'var(--accent-burgundy-light)' : 'var(--accent-gold-subtle)',
                        color: isBase ? 'var(--accent-burgundy)' : 'var(--accent-gold)',
                        border: isBase ? '1px solid var(--accent-burgundy)' : '1px solid var(--accent-gold)',
                      }}
                    >
                      {rule.id}
                    </span>
                    <h4
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {rule.title}
                    </h4>
                    {isBase && (
                      <span
                        style={{
                          fontSize: '0.62rem',
                          padding: '1px 6px',
                          background: 'var(--border-strong)',
                          color: '#fff',
                          borderRadius: 'var(--radius-full)',
                          fontWeight: 700,
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
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Original Player English */}
                  <div>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>
                      Authored English Proposal
                    </div>
                    <p
                      style={{
                        fontFamily: 'var(--font-editorial)',
                        fontSize: '0.88rem',
                        fontStyle: 'italic',
                        color: 'var(--text-primary)',
                        lineHeight: 1.35,
                      }}
                    >
                      &ldquo;{rule.original_text}&rdquo;
                    </p>
                  </div>

                  {/* Compiled Meaning */}
                  <div>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--accent-gold)', fontWeight: 700, marginBottom: '2px' }}>
                      Compiled Engine Law
                    </div>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
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
                    <span>Author: <strong>{rule.proposer_name}</strong></span>
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
                      background: 'var(--bg-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <AlertTriangle size={12} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
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
            background: 'rgba(0,0,0,0.6)',
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
              border: '1px solid var(--border-strong)',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code2 size={20} style={{ color: 'var(--accent-burgundy)' }} />
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 800 }}>
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

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Deterministic JSON output consumed by the game engine. No code execution is permitted.
            </p>

            <pre
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                background: 'var(--bg-subtle)',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
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
                style={{
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-burgundy)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
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
