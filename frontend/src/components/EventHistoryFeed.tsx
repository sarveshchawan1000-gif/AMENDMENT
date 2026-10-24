import React from 'react';
import { GameEventLog } from '../types/game';
import { Activity, Clock, ChevronRight } from 'lucide-react';

interface EventHistoryFeedProps {
  events: GameEventLog[];
  onSelectEvent: (event: GameEventLog) => void;
}

export const EventHistoryFeed: React.FC<EventHistoryFeedProps> = ({ events, onSelectEvent }) => {
  const reversed = [...events].reverse().slice(0, 8);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        padding: '18px 20px',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} style={{ color: 'var(--accent-burgundy)' }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '0.98rem', fontWeight: 800 }}>
            Assembly Proceedings Log
          </h3>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Click entry for Rule Autopsy
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
        {reversed.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Roll the dice to inaugurate the assembly proceedings.
          </div>
        ) : (
          reversed.map((evt) => (
            <div
              key={evt.id}
              onClick={() => onSelectEvent(evt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                  }}
                >
                  T{evt.turn}
                </span>

                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: evt.player_color,
                    flexShrink: 0,
                  }}
                />

                <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {evt.description}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {evt.score_delta !== 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: evt.score_delta > 0 ? 'var(--status-admitted)' : 'var(--status-rejected)',
                    }}
                  >
                    {evt.score_delta > 0 ? `+${evt.score_delta}` : evt.score_delta}
                  </span>
                )}
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
