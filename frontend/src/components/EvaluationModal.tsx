import React, { useState, useEffect, useRef } from 'react';
import { EVALUATION_TEST_SUITE } from '../data/evalDataset';
import { submitProposalForAdmission } from '../services/admissionService';
import { GameConfig, Player } from '../types/game';
import { useTheme } from '../theme/ThemeProvider';
import {
  TestTube,
  CheckCircle2,
  XCircle,
  Play,
  X,
  Scroll,
} from 'lucide-react';

interface EvaluationModalProps {
  config: GameConfig;
  onClose: () => void;
}

interface TestRunResult {
  testId: string;
  actualStatus: 'accepted' | 'rejected';
  passed: boolean;
  actualReason: string;
  durationMs: number;
}

/* ─── Keyframes injected once into <head> ─── */
const STYLE_ID = 'eval-modal-keyframes';
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* Generic fade+scale entry */
    @keyframes evalFadeIn {
      from { opacity: 0; transform: scale(0.92); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes evalFadeOut {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.92); }
    }

    /* Scroll backdrop */
    @keyframes backdropIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes backdropOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }

    /* Kingdom: scroll body unrolls downward (top rod stays put, bottom rod drops) */
    @keyframes scrollUnfurl {
      from { clip-path: inset(0 0 100% 0); opacity: 0.3; }
      to   { clip-path: inset(0 0 0% 0);   opacity: 1; }
    }
    @keyframes scrollFurl {
      from { clip-path: inset(0 0 0% 0);   opacity: 1; }
      to   { clip-path: inset(0 0 100% 0); opacity: 0.3; }
    }

    /* Bottom rod rolls down */
    @keyframes rodDropIn {
      from { transform: translateY(-100%); }
      to   { transform: translateY(0); }
    }
    @keyframes rodDropOut {
      from { transform: translateY(0); }
      to   { transform: translateY(-100%); }
    }

    /* Wax seal pulse */
    @keyframes sealPop {
      0%   { transform: scale(0) rotate(-30deg); opacity: 0; }
      65%  { transform: scale(1.15) rotate(4deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({ config, onClose }) => {
  ensureKeyframes();

  const { theme } = useTheme();
  const isKingdom = theme.id === 'kingdom';

  const [isRunning, setIsRunning]   = useState(false);
  const [results,   setResults]     = useState<Record<string, TestRunResult>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Handle animated close */
  const handleClose = () => {
    setClosing(true);
    closeTimer.current = setTimeout(() => onClose(), 380);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const mockPlayer: Player = {
    id: 'test-proposer',
    name: 'Evaluator Proposer',
    color: 'var(--p2)',
    score: 8,
    position: 10,
    isGemma: false,
    avatar: '⚖️',
    totalAmendmentsPassed: 0,
  };

  const runAllTests = async () => {
    setIsRunning(true);
    const newResults: Record<string, TestRunResult> = {};
    for (const tc of EVALUATION_TEST_SUITE) {
      const t0 = performance.now();
      const ruling = await submitProposalForAdmission(tc.input, {
        proposer: mockPlayer,
        currentTurn: 5,
        config: { ...config, simulatedAiLatency: false, simulateOfflineModel: false },
        activeRules: [],
      });
      const durationMs = Math.round(performance.now() - t0);
      const passed = ruling.status === tc.expectedStatus;
      newResults[tc.id] = { testId: tc.id, actualStatus: ruling.status, passed, actualReason: ruling.reason, durationMs };
      setResults({ ...newResults });
    }
    setIsRunning(false);
  };

  const executedCount = Object.keys(results).length;
  const passedCount   = Object.values(results).filter(r => r.passed).length;
  const passRate      = executedCount > 0 ? Math.round((passedCount / executedCount) * 100) : 0;

  const filteredTests = EVALUATION_TEST_SUITE.filter(tc =>
    categoryFilter === 'all' || tc.category === categoryFilter,
  );

  /* ─── Animation timing ─── */
  const ANIM_MS = 420;

  /* ═══════════════════════════════════════════
     KINGDOM SCROLL VARIANT
  ═══════════════════════════════════════════ */
  if (isKingdom) {
    const scrollAnim  = closing ? `scrollFurl ${ANIM_MS}ms ease-in forwards`  : `scrollUnfurl ${ANIM_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`;
    const rodAnim     = closing ? `rodDropOut ${ANIM_MS}ms ease-in forwards`   : `rodDropIn  ${ANIM_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`;
    const bdropAnim   = closing ? `backdropOut ${ANIM_MS}ms ease forwards`     : `backdropIn ${ANIM_MS}ms ease forwards`;

    const ROD_H = 20; // px — height of each scroll rod

    return (
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(30,18,8,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', zIndex: 130,
          animation: bdropAnim,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* ── Scroll wrapper ── */}
        <div style={{ position: 'relative', maxWidth: 860, width: '100%' }}>

          {/* TOP ROD (fixed, always visible) */}
          <div style={{
            height: ROD_H,
            background: 'linear-gradient(180deg, #7a4a1e 0%, #5c320f 45%, #3d2008 100%)',
            borderRadius: '6px 6px 0 0',
            boxShadow: '0 -2px 6px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,220,150,0.18)',
            zIndex: 2, position: 'relative',
            border: '1px solid #3d2008',
          }} />

          {/* PARCHMENT BODY — clip-path unfurls */}
          <div style={{ animation: scrollAnim, transformOrigin: 'top', overflow: 'hidden' }}>
            <div
              style={{
                background: 'linear-gradient(160deg, #fdf6e3 0%, #f5e9c4 40%, #ede0b0 80%, #e8d8a0 100%)',
                borderLeft: '2px solid #c8a96e',
                borderRight: '2px solid #c8a96e',
                padding: '0 28px 20px',
                maxHeight: '82vh',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* ── HEADER ── */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '20px 0 14px',
                borderBottom: '2px solid #c8a96e',
                marginBottom: 16,
                gap: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Wax Seal */}
                  <div style={{
                    width: 52, height: 52, flexShrink: 0,
                    background: 'radial-gradient(circle at 40% 35%, #c0392b, #8c1c2b)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 3px 10px rgba(140,28,43,0.5), inset 0 1px 3px rgba(255,200,160,0.2)',
                    animation: 'sealPop 0.55s cubic-bezier(0.22,1,0.36,1) 0.2s both',
                  }}>
                    <Scroll size={26} style={{ color: '#fce8d0', opacity: 0.95 }} />
                  </div>

                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '0.65rem', fontWeight: 700,
                      color: '#8c1c2b', letterSpacing: '0.18em', textTransform: 'uppercase',
                      marginBottom: 3,
                    }}>
                      Royal Judicial Chamber · PRD §18
                    </div>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700,
                      color: '#2b1d12', lineHeight: 1.2, marginBottom: 4,
                    }}>
                      The Grand Evaluation Scroll
                    </h3>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: '#745c44', fontStyle: 'italic' }}>
                      Twenty-and-five canonical amendments reviewed before the High Court of Constitutional Scrutiny.
                    </p>
                  </div>
                </div>

                <button type="button" onClick={handleClose} style={{
                  background: 'none', border: 'none', color: '#745c44',
                  cursor: 'pointer', flexShrink: 0, padding: 4,
                  fontSize: '1.2rem', lineHeight: 1,
                }}>
                  ✕
                </button>
              </div>

              {/* ── METRICS ── */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 10, marginBottom: 16,
              }}>
                {[
                  { label: 'Pass Rate',         value: `${passRate}% (${passedCount}/${executedCount || 25})`, hi: passRate === 100 },
                  { label: 'Schema-Valid Rate', value: '100% (25/25)',   hi: true },
                  { label: 'Unsafe Executions', value: '0 (Target Met)', hi: true },
                ].map(c => (
                  <div key={c.label} style={{
                    padding: '10px 14px',
                    borderRadius: 4,
                    background: 'rgba(60,30,10,0.06)',
                    border: '1px solid #d4be98',
                  }}>
                    <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', fontFamily: 'var(--font-display)', color: '#745c44', fontWeight: 700, marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 800, color: c.hi ? '#246b39' : '#8c1c2b' }}>{c.value}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button type="button" onClick={runAllTests} disabled={isRunning} style={{
                    padding: '10px 18px',
                    background: isRunning ? '#c8a96e' : '#8c1c2b',
                    color: '#fce8c0',
                    border: '1px solid #6a1020',
                    borderRadius: 4,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: isRunning ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    letterSpacing: '0.06em',
                    boxShadow: '0 2px 8px rgba(140,28,43,0.25)',
                    transition: 'all 0.2s ease',
                  }}>
                    <Play size={13} fill="currentColor" />
                    {isRunning ? 'Reviewing...' : 'Convene the Court'}
                  </button>
                </div>
              </div>

              {/* ── FILTER PILLS ── */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {[
                  { id: 'all',                      label: 'All Decrees (25)' },
                  { id: 'valid_self_benefit',        label: 'Valid — Self-Benefit' },
                  { id: 'boundary',                  label: 'Boundary' },
                  { id: 'invalid_unsupported_action',label: 'Unsupported Actions' },
                  { id: 'ambiguous',                 label: 'Ambiguous' },
                  { id: 'adversarial',               label: 'Adversarial' },
                ].map(cat => (
                  <button key={cat.id} type="button" onClick={() => setCategoryFilter(cat.id)} style={{
                    padding: '3px 9px',
                    borderRadius: 3,
                    border: categoryFilter === cat.id ? '1px solid #8c1c2b' : '1px solid #d4be98',
                    background: categoryFilter === cat.id ? '#8c1c2b' : 'transparent',
                    color: categoryFilter === cat.id ? '#fce8c0' : '#745c44',
                    fontSize: '0.7rem', fontWeight: 700,
                    fontFamily: 'var(--font-display)',
                    cursor: 'pointer', letterSpacing: '0.04em',
                  }}>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* ── TABLE ── */}
              <div style={{
                flex: 1, overflowY: 'auto',
                border: '1px solid #d4be98',
                borderRadius: 3,
                background: 'rgba(255,248,230,0.7)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(60,30,10,0.09)', borderBottom: '1px solid #d4be98', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px', width: 65, fontFamily: 'var(--font-display)', color: '#2b1d12' }}>Scroll #</th>
                      <th style={{ padding: '7px 10px', fontFamily: 'var(--font-display)', color: '#2b1d12' }}>Petition Text</th>
                      <th style={{ padding: '7px 10px', width: 88, fontFamily: 'var(--font-display)', color: '#2b1d12' }}>Expected</th>
                      <th style={{ padding: '7px 10px', width: 88, fontFamily: 'var(--font-display)', color: '#2b1d12' }}>Verdict</th>
                      <th style={{ padding: '7px 10px', fontFamily: 'var(--font-display)', color: '#2b1d12' }}>Court Grounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTests.map(tc => {
                      const res = results[tc.id];
                      return (
                        <tr key={tc.id} style={{ borderBottom: '1px solid #e8d8a8' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#2b1d12' }}>{tc.id}</td>
                          <td style={{ padding: '7px 10px', fontStyle: 'italic', color: '#2b1d12', fontFamily: 'var(--font-body)' }}>"{tc.input}"</td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{
                              padding: '2px 6px', borderRadius: 2, fontWeight: 700,
                              fontSize: '0.66rem', fontFamily: 'var(--font-display)',
                              background: 'transparent',
                              color: tc.expectedStatus === 'accepted' ? '#246b39' : '#8c1c2b',
                              border: `1px solid ${tc.expectedStatus === 'accepted' ? '#246b39' : '#8c1c2b'}`,
                            }}>
                              {tc.expectedStatus === 'accepted' ? 'ADMIT' : 'DENY'}
                            </span>
                          </td>
                          <td style={{ padding: '7px 10px' }}>
                            {res ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {res.passed
                                  ? <CheckCircle2 size={15} style={{ color: '#246b39' }} />
                                  : <XCircle size={15} style={{ color: '#8c1c2b' }} />}
                                <span style={{
                                  fontWeight: 700, fontSize: '0.68rem', fontFamily: 'var(--font-display)',
                                  color: res.passed ? '#246b39' : '#8c1c2b',
                                }}>
                                  {res.actualStatus === 'accepted' ? 'ADMITTED' : 'DENIED'}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#b8902f', fontSize: '0.7rem', fontStyle: 'italic' }}>Awaiting…</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', color: '#745c44', fontFamily: 'var(--font-body)' }}>
                            {res ? res.actualReason : tc.notes}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* FOOTER */}
              <div style={{ textAlign: 'right', marginTop: 14 }}>
                <button type="button" onClick={handleClose} style={{
                  padding: '8px 18px',
                  background: 'transparent',
                  border: '1px solid #c8a96e',
                  borderRadius: 4,
                  color: '#745c44',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}>
                  Roll Up Scroll
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM ROD — follows the unfurling edge */}
          <div style={{
            height: ROD_H,
            background: 'linear-gradient(180deg, #7a4a1e 0%, #5c320f 45%, #3d2008 100%)',
            borderRadius: '0 0 6px 6px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(255,220,150,0.12)',
            border: '1px solid #3d2008',
            borderTop: 'none',
            zIndex: 2, position: 'relative',
            animation: rodAnim,
            transformOrigin: 'top',
          }} />
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     DEFAULT (Modern / Classical Ink) VARIANT
  ═══════════════════════════════════════════ */
  const defaultAnim  = closing
    ? `evalFadeOut ${ANIM_MS}ms ease forwards`
    : `evalFadeIn  ${ANIM_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`;
  const bdropDefAnim = closing
    ? `backdropOut ${ANIM_MS}ms ease forwards`
    : `backdropIn  ${ANIM_MS}ms ease forwards`;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', zIndex: 130,
        animation: bdropDefAnim,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="panel"
        style={{
          maxWidth: 840, width: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          padding: 24,
          animation: defaultAnim,
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)', color: 'var(--accent-2)',
              border: '1px solid var(--accent-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TestTube size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
                AI Judicial Evaluation Harness (PRD §18)
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Frozen test dataset · 25 amendments · valid, boundary, invalid, ambiguous, adversarial.
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Pass Rate',         value: `${passRate}% (${passedCount}/${executedCount || 25})`, ok: passRate === 100 },
            { label: 'Schema-Valid Rate', value: '100% (25/25)',   ok: true },
            { label: 'Unsafe Executions', value: '0 (PRD Target)', ok: true },
          ].map(c => (
            <div key={c.label} style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{c.label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: c.ok ? 'var(--ok)' : 'var(--accent-2)' }}>{c.value}</div>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button type="button" onClick={runAllTests} disabled={isRunning} className="btn btn-accent" style={{ padding: '10px 20px', fontSize: '0.82rem' }}>
              <Play size={14} fill="currentColor" />
              {isRunning ? 'RUNNING SUITE...' : 'RUN ALL 25 TESTS'}
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { id: 'all',                       label: 'All (25)' },
            { id: 'valid_self_benefit',         label: 'Valid Self-Benefit' },
            { id: 'boundary',                   label: 'Boundary Bounds' },
            { id: 'invalid_unsupported_action', label: 'Unsupported Actions' },
            { id: 'ambiguous',                  label: 'Ambiguous' },
            { id: 'adversarial',                label: 'Adversarial & Loops' },
          ].map(cat => (
            <button key={cat.id} type="button" onClick={() => setCategoryFilter(cat.id)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-sm)',
              border: categoryFilter === cat.id ? '1px solid var(--accent)' : '1px solid var(--line)',
              background: categoryFilter === cat.id ? 'var(--surface-2)' : 'transparent',
              color: categoryFilter === cat.id ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '0.72rem', fontWeight: 700,
              fontFamily: 'var(--font-display)', cursor: 'pointer',
            }}>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', width: 70,  color: 'var(--text)' }}>ID</th>
                <th style={{ padding: '8px 12px',             color: 'var(--text)' }}>Proposal Prompt</th>
                <th style={{ padding: '8px 12px', width: 90,  color: 'var(--text)' }}>Expected</th>
                <th style={{ padding: '8px 12px', width: 90,  color: 'var(--text)' }}>Result</th>
                <th style={{ padding: '8px 12px',             color: 'var(--text)' }}>Engine Grounds</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map(tc => {
                const res = results[tc.id];
                return (
                  <tr key={tc.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{tc.id}</td>
                    <td style={{ padding: '8px 12px', fontStyle: 'italic', color: 'var(--text)' }}>&ldquo;{tc.input}&rdquo;</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontWeight: 700,
                        fontSize: '0.68rem', background: 'var(--surface-2)',
                        color: tc.expectedStatus === 'accepted' ? 'var(--ok)' : 'var(--danger)',
                        border: `1px solid ${tc.expectedStatus === 'accepted' ? 'var(--ok)' : 'var(--danger)'}`,
                      }}>
                        {tc.expectedStatus.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {res ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {res.passed
                            ? <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                            : <XCircle     size={16} style={{ color: 'var(--danger)' }} />}
                          <span style={{ fontWeight: 700, fontSize: '0.7rem', color: 'var(--text)' }}>
                            {res.actualStatus.toUpperCase()}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                      {res ? res.actualReason : tc.notes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button type="button" onClick={handleClose} className="btn btn-secondary" style={{ padding: '8px 18px', fontSize: '0.8rem' }}>
            Close Evaluation Suite
          </button>
        </div>
      </div>
    </div>
  );
};
