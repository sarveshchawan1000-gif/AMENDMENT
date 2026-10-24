import React, { useState, useEffect, useRef } from 'react';
import {
  GameConfig,
  Player,
  CompiledRule,
  AIRuling,
  DraftLineInput,
  DraftLineResult,
  DraftLineStatus,
} from '../types/game';
import {
  getLedgerLimit,
  evaluateDraftRuleDeterministic,
  AcceptedDraftRule,
} from '../engine/draftResolution';
import { submitProposalForAdmission, AdmissionContext } from '../services/admissionService';
import {
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Play,
  ChevronDown,
  ChevronUp,
  Cpu,
  Sparkles,
  BookOpen,
  Layers,
} from 'lucide-react';

interface DraftScreenProps {
  config: GameConfig;
  players: Player[];
  onStartMatch: (acceptedRules: CompiledRule[], rejectedRules: CompiledRule[]) => void;
  onCancelDraft?: () => void;
}

const EXAMPLE_RULES = [
  'When I roll an even number, gain 2 points.',
  'Landing on a prime tile grants +3 points.',
  'If the leader rolls a 6, leader moves back 2 tiles.',
  'When someone lands on tile 10, they reroll the die.',
  'Set win target to 25 points.',
  'Active player skips turn if score is greater than 10.',
];

const DEFAULT_LINE_PLACEHOLDERS = [
  'e.g. When I roll an even number, gain 2 points.',
  'e.g. Landing on a prime tile grants +3 points.',
  'e.g. If the leader rolls a 6, leader moves back 2 tiles.',
  'e.g. When someone lands on tile 12, they reroll.',
  'e.g. Set win target to 25 points.',
  'e.g. Active player skips turn if score is greater than 15.',
];

export const DraftScreen: React.FC<DraftScreenProps> = ({
  config,
  players,
  onStartMatch,
  onCancelDraft,
}) => {
  const ledgerLimit = getLedgerLimit(config.boardSize);
  const totalLines = players.length * 3;

  // Initialize lines (3 lines per player)
  const [lines, setLines] = useState<DraftLineInput[]>(() => {
    const initialLines: DraftLineInput[] = [];
    let lineIdx = 1;
    players.forEach((player) => {
      for (let i = 0; i < 3; i++) {
        initialLines.push({
          lineNumber: lineIdx++,
          playerId: player.id,
          playerName: player.name,
          playerColor: player.color,
          playerAvatar: player.avatar,
          text: '',
        });
      }
    });
    return initialLines;
  });

  const [results, setResults] = useState<Record<number, DraftLineResult>>({});
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentCheckingLine, setCurrentCheckingLine] = useState<number | null>(null);
  const [hasCommittedFirstResult, setHasCommittedFirstResult] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [expandedJsonLine, setExpandedJsonLine] = useState<number | null>(null);

  // Focus ref for first input
  const firstInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Update line text
  const handleLineChange = (lineNumber: number, text: string) => {
    if (isProcessing || isComplete) return;
    setLines((prev) =>
      prev.map((line) => (line.lineNumber === lineNumber ? { ...line, text: text.slice(0, 200) } : line))
    );
  };

  // Clickable example: fill the first empty line
  const handleFillNextEmpty = (exampleText: string) => {
    if (isProcessing || isComplete) return;
    const firstEmpty = lines.find((l) => l.text.trim() === '');
    if (firstEmpty) {
      handleLineChange(firstEmpty.lineNumber, exampleText);
    }
  };

  const filledCount = lines.filter((l) => l.text.trim().length > 0).length;
  const isAllFilled = filledCount === totalLines;

  // Process a single line with automatic single retry for technical failures
  const processLineWithRetry = async (
    line: DraftLineInput,
    acceptedSoFar: AcceptedDraftRule[]
  ): Promise<DraftLineResult> => {
    const player = players.find((p) => p.id === line.playerId) || players[0];
    const admissionContext: AdmissionContext = {
      proposer: player,
      currentTurn: 1,
      config,
      activeRules: acceptedSoFar.map((a) => a.rule),
      offlineModel: config.simulateOfflineModel,
    };

    let ruling: AIRuling | null = null;
    let isTechnicalFailure = false;

    // First attempt
    try {
      ruling = await submitProposalForAdmission(line.text, admissionContext);
      if (
        ruling.reason &&
        (ruling.reason.includes('unavailable') ||
          ruling.reason.includes('timed out') ||
          ruling.reason.includes('unreachable'))
      ) {
        isTechnicalFailure = true;
      }
    } catch {
      isTechnicalFailure = true;
    }

    // Single automatic retry on technical failure
    if (isTechnicalFailure) {
      try {
        await new Promise((res) => setTimeout(res, 250));
        ruling = await submitProposalForAdmission(line.text, admissionContext);
        if (
          ruling.reason &&
          (ruling.reason.includes('unavailable') ||
            ruling.reason.includes('timed out') ||
            ruling.reason.includes('unreachable'))
        ) {
          isTechnicalFailure = true;
        } else {
          isTechnicalFailure = false;
        }
      } catch {
        isTechnicalFailure = true;
      }
    }

    // If still technical failure, do NOT treat as rejection
    if (isTechnicalFailure || !ruling) {
      return {
        lineNumber: line.lineNumber,
        playerId: line.playerId,
        playerName: line.playerName,
        playerColor: line.playerColor,
        playerAvatar: line.playerAvatar,
        originalText: line.text,
        status: 'check-failed',
        reason: 'Verification service temporarily unavailable or timed out. Retry available.',
        rawJson: null,
      };
    }

    // If AI rejected the rule structurally / semantically
    if (ruling.status === 'rejected' || !ruling.compiled_rule) {
      return {
        lineNumber: line.lineNumber,
        playerId: line.playerId,
        playerName: line.playerName,
        playerColor: line.playerColor,
        playerAvatar: line.playerAvatar,
        originalText: line.text,
        status: 'removed-invalid',
        reason: ruling.reason || 'Constitutional limits exceeded or ambiguous phrasing.',
        aiRuling: ruling,
        rawJson: null,
      };
    }

    // AI accepted and compiled the rule -> now evaluate deterministically against accepted rules
    const compiled = ruling.compiled_rule;
    // Ensure rule has accurate proposer metadata
    compiled.proposer_id = line.playerId;
    compiled.proposer_name = line.playerName;
    compiled.title = `Draft Rule ${line.lineNumber}: ${compiled.title || 'Amendment'}`;

    const detEval = evaluateDraftRuleDeterministic(
      compiled,
      line.lineNumber,
      acceptedSoFar,
      config.boardSize
    );

    return {
      lineNumber: line.lineNumber,
      playerId: line.playerId,
      playerName: line.playerName,
      playerColor: line.playerColor,
      playerAvatar: line.playerAvatar,
      originalText: line.text,
      status: detEval.status,
      reason: detEval.reason,
      conflictingLineNumber: detEval.conflictingLineNumber,
      compiledRule: compiled,
      aiRuling: ruling,
      rawJson: compiled as unknown as Record<string, unknown>,
    };
  };

  // Run full verification loop across all lines in line order
  const runVerification = async () => {
    setShowConfirmModal(false);
    setIsProcessing(true);
    setHasCommittedFirstResult(false);

    const newResults: Record<number, DraftLineResult> = {};
    const acceptedRules: AcceptedDraftRule[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      setCurrentCheckingLine(line.lineNumber);

      const res = await processLineWithRetry(line, acceptedRules);
      newResults[line.lineNumber] = res;
      setResults({ ...newResults });
      setHasCommittedFirstResult(true);

      if (res.status === 'accepted' && res.compiledRule) {
        acceptedRules.push({
          lineNumber: line.lineNumber,
          rule: res.compiledRule,
        });
      }
    }

    setCurrentCheckingLine(null);
    setIsProcessing(false);
    setIsComplete(true);
  };

  // Retry failed checks (re-processes only lines with status 'check-failed' in line order)
  const handleRetryFailedChecks = async () => {
    setIsProcessing(true);
    const updatedResults = { ...results };

    // Collect all accepted rules up to now
    const acceptedRules: AcceptedDraftRule[] = [];
    lines.forEach((line) => {
      const res = updatedResults[line.lineNumber];
      if (res && res.status === 'accepted' && res.compiledRule) {
        acceptedRules.push({ lineNumber: line.lineNumber, rule: res.compiledRule });
      }
    });

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const existing = updatedResults[line.lineNumber];
      if (existing && existing.status === 'check-failed') {
        setCurrentCheckingLine(line.lineNumber);
        const res = await processLineWithRetry(line, acceptedRules);
        updatedResults[line.lineNumber] = res;
        setResults({ ...updatedResults });

        if (res.status === 'accepted' && res.compiledRule) {
          acceptedRules.push({ lineNumber: line.lineNumber, rule: res.compiledRule });
        }
      }
    }

    setCurrentCheckingLine(null);
    setIsProcessing(false);
  };

  // Cancel processing only allowed if no result has been committed yet
  const handleCancelProcessing = () => {
    if (!hasCommittedFirstResult) {
      setIsProcessing(false);
      setCurrentCheckingLine(null);
      setResults({});
    }
  };

  // Compute accepted and removed lists for results view
  const acceptedList: DraftLineResult[] = [];
  const removedList: DraftLineResult[] = [];
  lines.forEach((line) => {
    const res = results[line.lineNumber];
    if (res) {
      if (res.status === 'accepted') {
        acceptedList.push(res);
      } else {
        removedList.push(res);
      }
    }
  });

  const failedCount = lines.filter((l) => results[l.lineNumber]?.status === 'check-failed').length;

  // Final start match handler
  const handleFinalStartMatch = () => {
    // TODO: Backend batch draft endpoint (e.g. POST /game/{id}/draft-batch) could ingest all ratified draft rules in a single atomic transaction.
    const ratified: CompiledRule[] = acceptedList
      .filter((r) => r.compiledRule)
      .map((r) => ({
        ...r.compiledRule!,
        status: 'active' as const,
        active_from_turn: 1,
      }));

    const rejected: CompiledRule[] = removedList
      .filter((r) => r.compiledRule)
      .map((r) => ({
        ...r.compiledRule!,
        status: 'rejected' as const,
      }));

    onStartMatch(ratified, rejected);
  };

  const getStatusBadge = (status: DraftLineStatus) => {
    switch (status) {
      case 'accepted':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--ok)',
              border: '1px solid var(--ok)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <CheckCircle2 size={12} /> Accepted
          </span>
        );
      case 'removed-conflict':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ShieldAlert size={12} /> Removed: Conflict
          </span>
        );
      case 'removed-duplicate':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--accent-2)',
              border: '1px solid var(--accent-2)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Layers size={12} /> Removed: Duplicate
          </span>
        );
      case 'removed-ledger-full':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
              border: '1px solid var(--line)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <BookOpen size={12} /> Removed: Ledger Full
          </span>
        );
      case 'removed-invalid':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <XCircle size={12} /> Removed: Invalid
          </span>
        );
      case 'check-failed':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-display)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <AlertTriangle size={12} /> Check Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', width: '100%' }}>
      {/* Draft Window Card */}
      <div
        className="panel"
        style={{
          padding: '28px',
          marginBottom: '24px',
          borderRadius: 'var(--radius)',
        }}
      >
        {/* Header Section */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontSize: '0.78rem',
              fontWeight: 700,
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-display)',
            }}
          >
            <ScrollText size={14} />
            Draft Mode: Write Your Rules
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              fontWeight: 800,
              color: 'var(--text)',
              marginBottom: '8px',
            }}
          >
            The Legislative Convention
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            Every player is a lawmaker drafting 3 personal rules before the match begins.
            Rules are evaluated in global line order against deterministic engine limits.
            <strong> There is no voting.</strong>
          </p>
        </div>

        {/* Board Ledger Notice */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            marginBottom: '18px',
            fontSize: '0.86rem',
            color: 'var(--text)',
          }}
        >
          <BookOpen size={18} style={{ color: 'var(--accent-2)', flexShrink: 0 }} />
          <span>
            <strong>Ledger Limit ({config.boardSize}-Tile Board):</strong> Up to{' '}
            <strong style={{ color: 'var(--accent-2)' }}>{ledgerLimit} rules</strong> will be kept
            for this match. Later rules will be removed if the limit is reached.
          </span>
        </div>

        {/* Collapsible 'How Draft works' card */}
        <div
          style={{
            marginBottom: '22px',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setIsHowItWorksOpen((prev) => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--surface-2)',
              border: 'none',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
            }}
            aria-expanded={isHowItWorksOpen}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
              <span>How Draft Works</span>
            </div>
            {isHowItWorksOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {isHowItWorksOpen && (
            <div
              style={{
                padding: '16px',
                background: 'var(--surface)',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
              }}
            >
              Everyone writes 3 rules before the match. Rules are checked in line order. No voting.
              If two rules collide, the later one is removed and the earlier one stays. Rules that
              are unsupported or over the limits are removed. You will not be asked to rewrite
              rules. Rules are final once submitted.
            </div>
          )}
        </div>

        {/* Clickable Example Rules Bar (Shown in editing state) */}
        {!isProcessing && !isComplete && (
          <div style={{ marginBottom: '22px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles size={13} style={{ color: 'var(--accent)' }} />
              <span>Click to auto-fill next empty rule:</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {EXAMPLE_RULES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleFillNextEmpty(example)}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--line)';
                  }}
                >
                  &ldquo;{example}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Processing Banner / Progress */}
        {isProcessing && (
          <div
            style={{
              padding: '18px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '2px solid var(--accent)',
              marginBottom: '24px',
            }}
            aria-live="polite"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={20} className="animate-deliberation" style={{ color: 'var(--accent)' }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>
                    Checking rule {currentCheckingLine ?? 1} of {totalLines}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {currentCheckingLine && lines[currentCheckingLine - 1]
                      ? `Author: ${lines[currentCheckingLine - 1].playerName} — &ldquo;${
                          lines[currentCheckingLine - 1].text
                        }&rdquo;`
                      : 'Verifying against engine limit dictionary...'}
                  </div>
                </div>
              </div>

              {!hasCommittedFirstResult && (
                <button
                  type="button"
                  onClick={handleCancelProcessing}
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'var(--line)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(((currentCheckingLine ?? 0) - 1) / totalLines) * 100}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Results Ledger Summary Bar (Completed State) */}
        {isComplete && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '16px 20px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              marginBottom: '24px',
            }}
            aria-live="polite"
          >
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                }}
              >
                Match Ledger Status
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: 'var(--text)',
                }}
              >
                <span style={{ color: 'var(--ok)' }}>{acceptedList.length}</span> / {ledgerLimit}{' '}
                rules kept
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailedChecks}
                  disabled={isProcessing}
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    color: 'var(--accent)',
                    borderColor: 'var(--accent)',
                  }}
                >
                  <RotateCcw size={14} />
                  Retry failed checks ({failedCount})
                </button>
              )}

              <button
                type="button"
                onClick={handleFinalStartMatch}
                disabled={isProcessing}
                className="btn btn-accent"
                style={{
                  padding: '12px 28px',
                  fontSize: '1rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                <Play size={18} />
                Start match
              </button>
            </div>
          </div>
        )}

        {/* EDITING & INPUT VIEW (Shown while editing or processing) */}
        {!isComplete && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isAllFilled) setShowConfirmModal(true);
            }}
          >
            {/* Rule Lines Grouped by Player */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {players.map((player, pIdx) => {
                const playerLines = lines.slice(pIdx * 3, pIdx * 3 + 3);
                return (
                  <div
                    key={player.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius)',
                      padding: '18px 20px',
                      background: 'var(--surface)',
                    }}
                  >
                    {/* Player Owner Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '14px',
                      }}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: player.color,
                          color: 'var(--accent-contrast)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                        }}
                      >
                        {player.avatar}
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          color: 'var(--text)',
                        }}
                      >
                        {player.name}&apos;s Proposed Laws (Lines {playerLines[0].lineNumber}–
                        {playerLines[playerLines.length - 1].lineNumber})
                      </span>
                    </div>

                    {/* Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {playerLines.map((line, lSubIdx) => {
                        const linePlaceholder =
                          DEFAULT_LINE_PLACEHOLDERS[
                            (line.lineNumber - 1) % DEFAULT_LINE_PLACEHOLDERS.length
                          ];
                        const isCurrentChecking = currentCheckingLine === line.lineNumber;
                        const lineResult = results[line.lineNumber];

                        return (
                          <div
                            key={line.lineNumber}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.78rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <label
                                htmlFor={`draft-line-${line.lineNumber}`}
                                style={{
                                  fontWeight: 700,
                                  color: isCurrentChecking ? 'var(--accent)' : 'var(--text)',
                                }}
                              >
                                Line {line.lineNumber}
                              </label>
                              <span>
                                {line.text.length} / 200
                              </span>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                              }}
                            >
                              <input
                                id={`draft-line-${line.lineNumber}`}
                                ref={line.lineNumber === 1 ? firstInputRef : undefined}
                                type="text"
                                maxLength={200}
                                disabled={isProcessing}
                                value={line.text}
                                onChange={(e) =>
                                  handleLineChange(line.lineNumber, e.target.value)
                                }
                                placeholder={linePlaceholder}
                                aria-label={`Rule line ${line.lineNumber} for ${player.name}`}
                                style={{
                                  flex: 1,
                                  padding: '10px 14px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: isCurrentChecking
                                    ? '2px solid var(--accent)'
                                    : '1px solid var(--line)',
                                  background: isProcessing
                                    ? 'var(--surface-2)'
                                    : 'var(--surface)',
                                  color: 'var(--text)',
                                  fontFamily: 'var(--font-body)',
                                  fontSize: '0.9rem',
                                  outline: 'none',
                                }}
                              />

                              {lineResult && getStatusBadge(lineResult.status)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Actions Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    color: isAllFilled ? 'var(--ok)' : 'var(--text-muted)',
                  }}
                >
                  {filledCount} / {totalLines} lines filled
                </span>
                {!isAllFilled && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    (All lines are required to submit)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {onCancelDraft && !isProcessing && (
                  <button
                    type="button"
                    onClick={onCancelDraft}
                    className="btn btn-secondary"
                    style={{ padding: '10px 18px', fontSize: '0.9rem' }}
                  >
                    Back to Setup
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!isAllFilled || isProcessing}
                  className="btn btn-accent"
                  style={{
                    padding: '11px 26px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    opacity: isAllFilled ? 1 : 0.5,
                    cursor: isAllFilled ? 'pointer' : 'not-allowed',
                  }}
                >
                  Submit rules
                </button>
              </div>
            </div>
          </form>
        )}

        {/* RESULTS SCREEN (Shown when processing is complete) */}
        {isComplete && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Kept Rules Section */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '14px',
                }}
              >
                <ShieldCheck size={20} style={{ color: 'var(--ok)' }} />
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: 'var(--text)',
                  }}
                >
                  Kept Rules ({acceptedList.length}) — Ratified into Match Law
                </h3>
              </div>

              {acceptedList.length === 0 ? (
                <div
                  style={{
                    padding: '18px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                    fontSize: '0.9rem',
                  }}
                >
                  No proposed rules were accepted into the ledger.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {acceptedList.map((item) => (
                    <div
                      key={item.lineNumber}
                      style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--ok)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Top Row: Line & Owner & Status */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: '0.88rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Line #{item.lineNumber}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-2)',
                              color: item.playerColor,
                              fontWeight: 700,
                            }}
                          >
                            {item.playerAvatar} {item.playerName}
                          </span>
                        </div>
                        {getStatusBadge(item.status)}
                      </div>

                      {/* Original Wording */}
                      <div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                          }}
                        >
                          Original Wording
                        </div>
                        <div
                          style={{
                            fontSize: '0.92rem',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          &ldquo;{item.originalText}&rdquo;
                        </div>
                      </div>

                      {/* AI Constitutional Interpretation vs Engine Execution */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-2)',
                          fontSize: '0.82rem',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 800,
                              color: 'var(--accent)',
                              fontSize: '0.72rem',
                              textTransform: 'uppercase',
                              marginBottom: '2px',
                            }}
                          >
                            AI Constitutional Interpretation
                          </div>
                          <div style={{ color: 'var(--text)' }}>
                            {item.compiledRule?.readable_meaning ||
                              item.aiRuling?.normalized_rule ||
                              'Standard rule structure verified.'}
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              fontWeight: 800,
                              color: 'var(--ok)',
                              fontSize: '0.72rem',
                              textTransform: 'uppercase',
                              marginBottom: '2px',
                            }}
                          >
                            Engine Deterministic Execution
                          </div>
                          <div style={{ color: 'var(--text)' }}>{item.reason}</div>
                        </div>
                      </div>

                      {/* Raw JSON toggle */}
                      {item.rawJson && (
                        <div style={{ marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedJsonLine(
                                expandedJsonLine === item.lineNumber ? null : item.lineNumber
                              )
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-2)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {expandedJsonLine === item.lineNumber
                              ? 'Hide Schema JSON'
                              : 'Inspect Schema JSON'}
                          </button>
                          {expandedJsonLine === item.lineNumber && (
                            <pre
                              style={{
                                marginTop: '6px',
                                fontFamily: 'monospace',
                                fontSize: '0.72rem',
                                background: 'var(--surface-2)',
                                padding: '10px',
                                borderRadius: 'var(--radius-sm)',
                                overflowX: 'auto',
                                border: '1px solid var(--line)',
                              }}
                            >
                              {JSON.stringify(item.rawJson, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Removed Rules Section */}
            {removedList.length > 0 && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '14px',
                  }}
                >
                  <ShieldAlert size={20} style={{ color: 'var(--danger)' }} />
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      color: 'var(--text)',
                    }}
                  >
                    Removed Rules ({removedList.length}) — Excluded from Play
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {removedList.map((item) => (
                    <div
                      key={item.lineNumber}
                      style={{
                        padding: '16px 20px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        opacity: 0.9,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Top Row: Line & Owner & Status */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: '0.88rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Line #{item.lineNumber}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-2)',
                              color: item.playerColor,
                              fontWeight: 700,
                            }}
                          >
                            {item.playerAvatar} {item.playerName}
                          </span>
                        </div>
                        {getStatusBadge(item.status)}
                      </div>

                      {/* Original Wording */}
                      <div>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                          }}
                        >
                          Original Wording
                        </div>
                        <div
                          style={{
                            fontSize: '0.92rem',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          &ldquo;{item.originalText}&rdquo;
                        </div>
                      </div>

                      {/* Reason */}
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--surface-2)',
                          fontSize: '0.82rem',
                          color: 'var(--danger)',
                          fontWeight: 600,
                        }}
                      >
                        Reason: {item.reason}
                      </div>

                      {/* Raw JSON toggle (if compiled) */}
                      {item.rawJson && (
                        <div style={{ marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedJsonLine(
                                expandedJsonLine === item.lineNumber ? null : item.lineNumber
                              )
                            }
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-2)',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            {expandedJsonLine === item.lineNumber
                              ? 'Hide Schema JSON'
                              : 'Inspect Schema JSON'}
                          </button>
                          {expandedJsonLine === item.lineNumber && (
                            <pre
                              style={{
                                marginTop: '6px',
                                fontFamily: 'monospace',
                                fontSize: '0.72rem',
                                background: 'var(--surface-2)',
                                padding: '10px',
                                borderRadius: 'var(--radius-sm)',
                                overflowX: 'auto',
                                border: '1px solid var(--line)',
                              }}
                            >
                              {JSON.stringify(item.rawJson, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div
            className="panel"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--surface-2)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                border: '1px solid var(--accent)',
              }}
            >
              <ScrollText size={28} />
            </div>

            <h3
              id="confirm-modal-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--text)',
                marginBottom: '10px',
              }}
            >
              Confirm Rule Submission
            </h3>

            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                marginBottom: '24px',
              }}
            >
              Rules are final after submitting. You will not be able to edit them.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontSize: '0.9rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runVerification}
                className="btn btn-accent"
                style={{
                  padding: '10px 24px',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                }}
              >
                Confirm &amp; Process
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
