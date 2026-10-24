import React from 'react';
import { GameState } from '../types/game';
import { useTheme } from '../theme/ThemeProvider';
import { ThemePicker } from '../theme/ThemePicker';
import {
  Scroll,
  RotateCcw,
  Download,
  Sparkles,
} from 'lucide-react';

interface HeaderProps {
  state: GameState;
  onResetGame: () => void;
  onOpenEvaluation: () => void;
  onExportRulebook: () => void;
  onToggleAiOffline: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  onResetGame,
  onOpenEvaluation,
  onExportRulebook,
  onToggleAiOffline,
}) => {
  const activePlayer = state.players[state.activePlayerIndex];
  const { theme } = useTheme();

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: 'var(--panel-shadow)',
      }}
    >
      {/* Brand & Subtitle — clicking returns to home/setup */}
      <button
        type="button"
        onClick={onResetGame}
        title="Return to home / setup screen"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          background: 'none',
          border: 'none',
          padding: '6px 8px',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          transition: 'background 0.15s ease, opacity 0.15s ease',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'none';
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius)',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-contrast)',
            flexShrink: 0,
          }}
        >
          <Scroll size={22} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: 'var(--text)',
              }}
            >
              AMENDMENT
            </h1>
            {state.phase !== 'setup' && (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  color: 'var(--accent-2)',
                  border: '1px solid var(--accent-2)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {state.config.mode} Mode
              </span>
            )}
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}
          >
            The Board Game That Rewrites Its Own Rules
          </p>
        </div>
      </button>

      {/* Match Context / Turn Indicator */}
      {state.phase !== 'setup' && activePlayer && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--surface-2)',
            padding: '6px 16px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              TURN {state.turnCount}
            </span>
            <span style={{ color: 'var(--line)' }}>•</span>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
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
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>
                {activePlayer.name}
              </span>
              {activePlayer.isGemma && (
                <Sparkles size={13} style={{ color: 'var(--accent-2)' }} />
              )}
            </div>
          </div>

          <span style={{ color: 'var(--line)' }}>•</span>

          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Target: <strong style={{ color: 'var(--accent-2)' }}>{state.config.winTarget} pts</strong>
          </span>
        </div>
      )}

      {/* Global Actions and Theme Picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {/* Compact Theme Picker (only during match setup before game starts) */}
        {state.phase === 'setup' && <ThemePicker compact />}

        {/* Gemma: Ready and Rules buttons removed */}
      </div>
    </header>
  );
};
