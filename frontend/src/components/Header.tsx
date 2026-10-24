import React from 'react';
import { GameState, ThemeMode } from '../types/game';
import {
  Scroll,
  Sun,
  Moon,
  RotateCcw,
  Download,
  TestTube,
  Cpu,
  WifiOff,
  Sparkles,
} from 'lucide-react';

interface HeaderProps {
  state: GameState;
  onThemeToggle: () => void;
  onResetGame: () => void;
  onOpenEvaluation: () => void;
  onExportRulebook: () => void;
  onToggleAiOffline: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  onThemeToggle,
  onResetGame,
  onOpenEvaluation,
  onExportRulebook,
  onToggleAiOffline,
}) => {
  const activePlayer = state.players[state.activePlayerIndex];
  const isDark = state.config.theme === 'dark';

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: 'var(--shadow-subtle)',
      }}
    >
      {/* Brand & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-burgundy), #5A1212)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FAF7F2',
            boxShadow: '0 2px 8px rgba(139, 30, 30, 0.25)',
          }}
        >
          <Scroll size={22} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: 'var(--text-primary)',
              }}
            >
              AMENDMENT
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--accent-gold-subtle)',
                color: 'var(--accent-gold)',
                border: '1px solid var(--accent-gold)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {state.config.mode} Mode
            </span>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-editorial)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}
          >
            The Board Game That Rewrites Its Own Rules
          </p>
        </div>
      </div>

      {/* Match Context / Turn Indicator */}
      {state.phase !== 'setup' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-subtle)',
            padding: '6px 16px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              TURN {state.turnCount}
            </span>
            <span style={{ color: 'var(--border-strong)' }}>•</span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-surface)',
                border: `2px solid ${activePlayer.color}`,
              }}
            >
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  background: activePlayer.color,
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {activePlayer.name}
              </span>
              {activePlayer.isGemma && (
                <Sparkles size={13} style={{ color: 'var(--accent-gold)' }} />
              )}
            </div>
          </div>

          <span style={{ color: 'var(--border-strong)' }}>•</span>

          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Target: <strong style={{ color: 'var(--accent-gold)' }}>{state.config.winTarget} pts</strong>
          </span>
        </div>
      )}

      {/* Global Actions and Toggles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Local AI Model Status Pill */}
        <button
          onClick={onToggleAiOffline}
          title={
            state.config.simulateOfflineModel
              ? 'Local Gemma AI is SIMULATED OFFLINE. Click to restore online status.'
              : 'Local Gemma AI running via Ollama. Click to test offline fallback behavior.'
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid',
            borderColor: state.config.simulateOfflineModel
              ? 'var(--status-rejected-border)'
              : 'var(--status-admitted-border)',
            background: state.config.simulateOfflineModel
              ? 'var(--status-rejected-bg)'
              : 'var(--status-admitted-bg)',
            color: state.config.simulateOfflineModel
              ? 'var(--status-rejected)'
              : 'var(--status-admitted)',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {state.config.simulateOfflineModel ? (
            <>
              <WifiOff size={14} />
              <span>Ollama: Offline (Mock)</span>
            </>
          ) : (
            <>
              <Cpu size={14} />
              <span>Gemma AI: Ready</span>
            </>
          )}
        </button>

        {/* 25-amendment Evaluation Modal */}
        <button
          onClick={onOpenEvaluation}
          title="Run 25-amendment AI evaluation suite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <TestTube size={14} style={{ color: 'var(--accent-gold)' }} />
          <span>Eval Suite (25)</span>
        </button>

        {/* Export JSON Rulebook */}
        {state.phase !== 'setup' && (
          <button
            onClick={onExportRulebook}
            title="Download compiled active rules as JSON"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            <span>Export Rules</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={onThemeToggle}
          title={isDark ? 'Switch to Parchment Light Theme' : 'Switch to Chamber Dark Theme'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Reset / New Game */}
        <button
          onClick={onResetGame}
          title="Return to Match Setup"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-surface)',
            color: 'var(--accent-burgundy)',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={13} />
          <span>New Game</span>
        </button>
      </div>
    </header>
  );
};
