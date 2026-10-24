import React from 'react';
import { Player } from '../types/game';
import { rankPlayers } from '../engine/gameEngine';
import { Trophy, Crown, Anchor, Scroll, Activity } from 'lucide-react';

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
  const ranked = rankPlayers(players);
  const activePlayer = players[activePlayerIndex];

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={18} style={{ color: 'var(--accent-gold)' }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 800 }}>
            Chamber Standings
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
          const isActive = player.id === activePlayer.id;
          const progressPercent = Math.min(100, Math.round((player.score / winTarget) * 100));

          return (
            <div
              key={player.id}
              style={{
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--bg-subtle)' : 'transparent',
                border: isActive
                  ? `2px solid ${player.color}`
                  : '1px solid var(--border-subtle)',
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
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      color: isLeader ? 'var(--accent-gold)' : 'var(--text-muted)',
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
                      color: '#fff',
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
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
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
                            background: 'var(--accent-gold-subtle)',
                            color: 'var(--accent-gold)',
                            border: '1px solid var(--accent-gold)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.65rem',
                            fontWeight: 800,
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
                            background: 'var(--bg-surface)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-strong)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                          }}
                        >
                          <Anchor size={10} /> LAST
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Tile {player.position} of {boardSize} • {player.totalAmendmentsPassed} Amendment{player.totalAmendmentsPassed === 1 ? '' : 's'} Passed
                    </div>
                  </div>
                </div>

                {/* Right: Score */}
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: isLeader ? 'var(--accent-gold)' : 'var(--text-primary)',
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
                  borderRadius: '3px',
                  background: 'var(--bg-subtle)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    background: isLeader ? 'var(--accent-gold)' : player.color,
                    borderRadius: '3px',
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
