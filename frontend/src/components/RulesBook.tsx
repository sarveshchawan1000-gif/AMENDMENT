import React, { useState } from 'react';
import { RulesBookItem } from '../services/gameApi';
import { useTheme } from '../theme/ThemeProvider';
import {
  BookOpen,
  Clock,
  User,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

interface RulesBookProps {
  rules: RulesBookItem[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export const RulesBook: React.FC<RulesBookProps> = ({
  rules,
  isLoading = false,
  error = null,
  onRefresh,
}) => {
  const { theme } = useTheme();
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return 'At game start';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        ' (' + date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(34, 197, 94, 0.12)',
              color: 'var(--ok, #22c55e)',
              border: '1px solid var(--ok, #22c55e)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <CheckCircle2 size={11} />
            ACTIVE
          </span>
        );
      case 'rejected':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--danger, #ef4444)',
              border: '1px solid var(--danger, #ef4444)',
              fontSize: '0.68rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <XCircle size={11} />
            REJECTED
          </span>
        );
      default:
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
            {status}
          </span>
        );
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
      {/* Header */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <BookOpen size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: 'var(--text)',
                }}
              >
                Rules Book
              </h3>
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                }}
              >
                HYBRID MODE
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Persistent Constitutional Archive
            </span>
          </div>
        </div>

        {/* Refresh button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh Rules Book from backend"
            className="btn btn-secondary"
            style={{
              padding: '6px 10px',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            <span>Sync</span>
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--danger, #ef4444)',
            color: 'var(--danger, #ef4444)',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              style={{
                marginLeft: 'auto',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && rules.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 0' }}>
          {[1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: '70px',
                borderRadius: 'var(--radius)',
                background: 'var(--surface-2)',
                opacity: 0.6,
                animation: 'pulse 1.5s infinite ease-in-out',
              }}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && rules.length === 0 && (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            borderRadius: 'var(--radius)',
            border: '1px dashed var(--line)',
            background: 'var(--surface-2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <BookOpen size={28} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
            No Rules Recorded Yet
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '300px', lineHeight: 1.4 }}>
            Court-accepted amendments and curated rules for this Hybrid game are permanently archived here in chronological order.
          </div>
        </div>
      )}

      {/* Rules List in accepted order */}
      {rules.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '520px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
          {rules.map((rule, index) => {
            const isExpanded = expandedRuleId === rule.id;
            const compiled = rule.compiled_rule || {};

            return (
              <div
                key={rule.id || index}
                style={{
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Header Row: Order Number, ID, Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        color: 'var(--accent-2)',
                        background: 'var(--surface)',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      #{rule.order || index + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: 'var(--text)',
                      }}
                    >
                      {rule.id}
                    </span>
                  </div>

                  <div>{getStatusBadge(rule.status || 'active')}</div>
                </div>

                {/* Description */}
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text)',
                    lineHeight: 1.45,
                    fontWeight: 600,
                  }}
                >
                  {rule.description || rule.original_text}
                </div>

                {/* Original Proposed Text if different */}
                {rule.original_text && rule.original_text !== rule.description && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      background: 'var(--surface)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    Proposed: "{rule.original_text}"
                  </div>
                )}

                {/* Metadata Row: Proposer & Creation Timestamp */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    borderTop: '1px solid var(--line)',
                    paddingTop: '8px',
                    marginTop: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <User size={12} />
                    <span>{rule.proposer_name || rule.proposer_id || 'System'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Clock size={12} />
                    <span>{formatTimestamp(rule.created_at)}</span>
                  </div>
                </div>

                {/* Mechanics preview toggle */}
                <button
                  type="button"
                  onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--accent)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 0',
                    alignSelf: 'flex-start',
                  }}
                >
                  <Sparkles size={11} />
                  <span>{isExpanded ? 'Hide Engine Representation' : 'View Engine Representation'}</span>
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {/* Expanded Compiled Rule JSON */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(compiled, null, 2)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
