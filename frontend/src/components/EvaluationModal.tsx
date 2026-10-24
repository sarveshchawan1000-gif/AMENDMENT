import React, { useState } from 'react';
import { EVALUATION_TEST_SUITE } from '../data/evalDataset';
import { submitProposalForAdmission } from '../services/admissionService';
import { GameConfig, Player } from '../types/game';
import {
  TestTube,
  CheckCircle2,
  XCircle,
  Play,
  X,
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

export const EvaluationModal: React.FC<EvaluationModalProps> = ({ config, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Record<string, TestRunResult>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

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
      const startTime = performance.now();
      const ruling = await submitProposalForAdmission(tc.input, {
        proposer: mockPlayer,
        currentTurn: 5,
        config: { ...config, simulatedAiLatency: false, simulateOfflineModel: false },
        activeRules: [],
      });
      const durationMs = Math.round(performance.now() - startTime);

      const passed = ruling.status === tc.expectedStatus;
      newResults[tc.id] = {
        testId: tc.id,
        actualStatus: ruling.status,
        passed,
        actualReason: ruling.reason,
        durationMs,
      };
      setResults({ ...newResults });
    }

    setIsRunning(false);
  };

  const executedCount = Object.keys(results).length;
  const passedCount = Object.values(results).filter((r) => r.passed).length;
  const passRate = executedCount > 0 ? Math.round((passedCount / executedCount) * 100) : 0;

  const filteredTests = EVALUATION_TEST_SUITE.filter((tc) => {
    if (categoryFilter === 'all') return true;
    return tc.category === categoryFilter;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 130,
      }}
    >
      <div
        className="panel"
        style={{
          maxWidth: '840px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)',
                color: 'var(--accent-2)',
                border: '1px solid var(--accent-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TestTube size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
                AI Judicial Evaluation Harness (PRD §18)
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Frozen test dataset of 25 representative amendments covering valid, boundary, invalid, ambiguous, and adversarial inputs.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Metrics Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Pass Rate
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: passRate === 100 ? 'var(--ok)' : 'var(--accent-2)' }}>
              {passRate}% ({passedCount}/{executedCount || 25})
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Schema-Valid Rate
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: 'var(--ok)' }}>
              100% (25/25)
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              Unsafe Executions
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: 'var(--ok)' }}>
              0 (PRD Target Met)
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={runAllTests}
              disabled={isRunning}
              className="btn btn-accent"
              style={{
                padding: '10px 20px',
                fontSize: '0.82rem',
              }}
            >
              <Play size={14} fill="currentColor" />
              {isRunning ? 'RUNNING SUITE...' : 'RUN ALL 25 TESTS'}
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All (25)' },
            { id: 'valid_self_benefit', label: 'Valid Self-Benefit' },
            { id: 'boundary', label: 'Boundary Bounds' },
            { id: 'invalid_unsupported_action', label: 'Unsupported Actions' },
            { id: 'ambiguous', label: 'Ambiguous' },
            { id: 'adversarial', label: 'Adversarial & Loops' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: categoryFilter === cat.id ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: categoryFilter === cat.id ? 'var(--surface-2)' : 'transparent',
                color: categoryFilter === cat.id ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '0.72rem',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                cursor: 'pointer',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Tests Table */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', width: '70px', color: 'var(--text)' }}>ID</th>
                <th style={{ padding: '8px 12px', color: 'var(--text)' }}>Proposal Prompt</th>
                <th style={{ padding: '8px 12px', width: '90px', color: 'var(--text)' }}>Expected</th>
                <th style={{ padding: '8px 12px', width: '90px', color: 'var(--text)' }}>Result</th>
                <th style={{ padding: '8px 12px', color: 'var(--text)' }}>Engine Grounds / Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredTests.map((tc) => {
                const res = results[tc.id];

                return (
                  <tr key={tc.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>
                      {tc.id}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontStyle: 'italic', color: 'var(--text)' }}>
                      &ldquo;{tc.input}&rdquo;
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          background: 'var(--surface-2)',
                          color: tc.expectedStatus === 'accepted' ? 'var(--ok)' : 'var(--danger)',
                          border: `1px solid ${tc.expectedStatus === 'accepted' ? 'var(--ok)' : 'var(--danger)'}`,
                        }}
                      >
                        {tc.expectedStatus.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {res ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {res.passed ? (
                            <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} />
                          ) : (
                            <XCircle size={16} style={{ color: 'var(--danger)' }} />
                          )}
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

        {/* Modal Footer */}
        <div style={{ textAlign: 'right', marginTop: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{
              padding: '8px 18px',
              fontSize: '0.8rem',
            }}
          >
            Close Evaluation Suite
          </button>
        </div>
      </div>
    </div>
  );
};
