import React from 'react';
import { Player } from '../types/game';
import { rankPlayers } from '../engine/gameEngine';
import { useTheme } from '../theme/ThemeProvider';
import { Trophy, Crown, Anchor } from 'lucide-react';

interface LeaderboardProps {
  players: Player[];
  activePlayerIndex: number;
  winTarget: number;
  boardSize: number;
  onSelectPlayerHistory?: (playerId: string) => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({
  players,
  activePlayerIndex,
  winTarget,
  boardSize,
}) => {
  const { theme } = useTheme();
  const ranked = rankPlayers(players);
  const activePlayer = players[activePlayerIndex];

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={18} style={{ color: 'var(--accent-2)' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
            {theme.labels.leaderboard}
          </h3>
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Target: {winTarget} pts
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ranked.map((player, rankIndex) => {
          const isLeader = rankIndex === 0;
          const isLast = rankIndex === ranked.length - 1 && ranked.length > 1;
          const isActive = activePlayer && player.id === activePlayer.id;
          const progressPercent = Math.min(100, Math.round((player.score / winTarget) * 100));

          return (
            <div
              key={player.id}
              style={{
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--surface-2)' : 'transparent',
                border: isActive
                  ? `2px solid ${player.color}`
                  : '1px solid var(--line)',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Left: Rank, Avatar, Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color: isLeader ? 'var(--accent-2)' : 'var(--text-muted)',
                      width: '18px',
                    }}
                  >
                    #{rankIndex + 1}
                  </span>

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

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text)' }}>
                        {player.name}
                      </span>
                      {isLeader && (
                        <span
                          title="Current Leader (qualifies for 'is_leader' rule conditions)"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 6px',
                            background: 'var(--surface-2)',
                            color: 'var(--accent-2)',
                            border: '1px solid var(--accent-2)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          <Crown size={10} /> LEADER
                        </span>
                      )}
                      {isLast && (
                        <span
                          title="Trailing Player (qualifies for 'is_last' rule conditions)"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 6px',
                            background: 'var(--surface)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--line)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          <Anchor size={10} /> LAST
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Tile {player.position} of {boardSize} • {player.movesPlayed ?? 0} {player.movesPlayed === 1 ? 'Move' : 'Moves'} • {player.totalAmendmentsPassed} Amendment{player.totalAmendmentsPassed === 1 ? '' : 's'} Passed
                    </div>
                  </div>
                </div>

                {/* Right: Score */}
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: isLeader ? 'var(--accent-2)' : 'var(--text)',
                      lineHeight: 1,
                    }}
                  >
                    {player.score}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '2px' }}>
                      pts
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress bar to Win Target */}
              <div
                style={{
                  width: '100%',
                  height: '5px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-2)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: isLeader ? 'var(--accent-2)' : player.color,
                    borderRadius: 'var(--radius-sm)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
