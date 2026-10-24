import React from 'react';
import { THEMES, ThemeId } from './themes';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Palette } from 'lucide-react';

interface ThemePickerProps {
  compact?: boolean;
}

export const ThemePicker: React.FC<ThemePickerProps> = ({ compact = false }) => {
  const { theme, mode, setTheme, setMode } = useTheme();

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--surface-2)',
          padding: '4px 8px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--line)',
        }}
      >
        <Palette size={15} style={{ color: 'var(--text-muted)' }} />

        {/* Theme Radio Tabs */}
        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
          const t = THEMES[id];
          const isSelected = theme.id === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              title={`${t.name}: ${t.tagline}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                background: isSelected ? 'var(--surface)' : 'transparent',
                color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isSelected ? 700 : 500,
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.04em',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{t.name}</span>
            </button>
          );
        })}

        {/* Light/Dark Mode toggle only if theme supportsMode (Modern) */}
        {theme.supportsMode && (
          <button
            type="button"
            onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            title={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
              marginLeft: '2px',
            }}
          >
            {mode === 'light' ? <Moon size={13} /> : <Sun size={13} />}
          </button>
        )}
      </div>
    );
  }

  // Full / Setup Screen Radio-style View
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
          const t = THEMES[id];
          const isSelected = theme.id === id;

          return (
            <div
              key={id}
              onClick={() => setTheme(id)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') setTheme(id);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 'var(--radius)',
                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: isSelected ? 'var(--surface-2)' : 'var(--surface)',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      color: 'var(--text)',
                    }}
                  >
                    {t.name}
                  </span>

                  <input
                    type="radio"
                    name="amendment-theme-picker"
                    checked={isSelected}
                    onChange={() => setTheme(id)}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  {t.tagline}
                </p>
              </div>

              {/* Mode toggle for supported themes */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: '26px' }}>
                {t.supportsMode && isSelected && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <button
                      type="button"
                      onClick={() => setMode('light')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: mode === 'light' ? '1px solid var(--accent)' : '1px solid var(--line)',
                        background: mode === 'light' ? 'var(--surface)' : 'transparent',
                        color: mode === 'light' ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Sun size={11} /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('dark')}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-sm)',
                        border: mode === 'dark' ? '1px solid var(--accent)' : '1px solid var(--line)',
                        background: mode === 'dark' ? 'var(--surface)' : 'transparent',
                        color: mode === 'dark' ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Moon size={11} /> Dark
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
