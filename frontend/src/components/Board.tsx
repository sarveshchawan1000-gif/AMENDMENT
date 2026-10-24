import React from 'react';
import { BoardSize, Player } from '../types/game';
import { isPrime } from '../services/admissionService';
import { Sparkles, Flag, Crown, Compass } from 'lucide-react';

interface BoardProps {
  boardSize: BoardSize;
  players: Player[];
  activePlayerIndex: number;
}

export const Board: React.FC<BoardProps> = ({
  boardSize,
  players,
  activePlayerIndex,
}) => {
  const activePlayer = players[activePlayerIndex];
  const gridDimension = boardSize === 36 ? 6 : boardSize === 64 ? 8 : 10;

  // Build snake path (boustrophedon) grid of tile numbers
  // Row 0 is at bottom (or top). Let's lay it out so Tile 1 starts at bottom-left, snaking upward!
  // This classic board game layout makes progress feel like climbing to the peak.
  const gridRows: number[][] = [];
  let currentTile = 1;

  for (let r = 0; r < gridDimension; r++) {
    const rowTiles: number[] = [];
    for (let c = 0; c < gridDimension; c++) {
      rowTiles.push(currentTile++);
    }
    // Alternate direction for odd rows
    if (r % 2 === 1) {
      rowTiles.reverse();
    }
    gridRows.push(rowTiles);
  }

  // Reverse rows so Tile 1 is at the bottom
  gridRows.reverse();

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
        alignItems: 'center',
      }}
    >
      {/* Board Header / Legend */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={18} style={{ color: 'var(--accent-burgundy)' }} />
          <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: '0.95rem' }}>
            The Assembly Floor ({boardSize} Tiles)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                background: 'var(--board-prime-bg)',
                border: '1px solid var(--board-prime-border)',
                display: 'inline-block',
              }}
            />
            <span>Prime Tile (★)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: `2px solid ${activePlayer.color}`,
                display: 'inline-block',
              }}
            />
            <span>Active Token</span>
          </div>
        </div>
      </div>

      {/* Grid Canvas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridDimension}, minmax(0, 1fr))`,
          gap: '6px',
          width: '100%',
          maxWidth: boardSize === 100 ? '640px' : boardSize === 64 ? '580px' : '520px',
          aspectRatio: '1 / 1',
        }}
      >
        {gridRows.map((row, rIdx) =>
          row.map((tileNum) => {
            const isPrimeTile = isPrime(tileNum);
            const isStart = tileNum === 1;
            const isFinish = tileNum === boardSize;
            const playersOnTile = players.filter((p) => p.position === tileNum);
            const hasActivePlayer = playersOnTile.some((p) => p.id === activePlayer.id);

            return (
              <div
                key={tileNum}
                style={{
                  position: 'relative',
                  borderRadius: 'var(--radius-sm)',
                  background: isPrimeTile
                    ? 'var(--board-prime-bg)'
                    : isStart
                    ? 'var(--status-admitted-bg)'
                    : isFinish
                    ? 'var(--accent-burgundy-light)'
                    : 'var(--board-tile-bg)',
                  border: hasActivePlayer
                    ? `2.5px solid ${activePlayer.color}`
                    : isPrimeTile
                    ? '1.5px solid var(--board-prime-border)'
                    : isStart
                    ? '1.5px solid var(--status-admitted-border)'
                    : isFinish
                    ? '1.5px solid var(--status-rejected-border)'
                    : '1px solid var(--board-tile-border)',
                  boxShadow: hasActivePlayer
                    ? `0 0 10px ${activePlayer.color}55`
                    : '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: boardSize === 100 ? '2px' : '4px',
                  userSelect: 'none',
                  transition: 'all 0.2s ease',
                  overflow: 'hidden',
                }}
              >
                {/* Tile Number & Badges */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    lineHeight: 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: boardSize === 100 ? '0.62rem' : boardSize === 64 ? '0.72rem' : '0.82rem',
                      fontWeight: 700,
                      color: hasActivePlayer
                        ? activePlayer.color
                        : isPrimeTile
                        ? 'var(--accent-gold)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {tileNum}
                  </span>

                  {isPrimeTile && (
                    <span
                      title="Prime numbered tile (triggers prime tile bounties)"
                      style={{
                        fontSize: boardSize === 100 ? '0.55rem' : '0.68rem',
                        color: 'var(--accent-gold)',
                        fontWeight: 900,
                      }}
                    >
                      ★
                    </span>
                  )}
                  {isStart && (
                    <span
                      title="Assembly Start"
                      style={{ fontSize: '0.62rem', color: 'var(--status-admitted)', fontWeight: 800 }}
                    >
                      START
                    </span>
                  )}
                  {isFinish && (
                    <span
                      title="Senate Chamber"
                      style={{ fontSize: '0.62rem', color: 'var(--accent-burgundy)', fontWeight: 800 }}
                    >
                      FINISH
                    </span>
                  )}
                </div>

                {/* Tokens Stacked on Tile */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    gap: '2px',
                    margin: 'auto 0',
                  }}
                >
                  {playersOnTile.map((p) => {
                    const isActive = p.id === activePlayer.id;
                    return (
                      <div
                        key={p.id}
                        title={`${p.name} (Score: ${p.score})`}
                        style={{
                          width: boardSize === 100 ? '18px' : boardSize === 64 ? '22px' : '26px',
                          height: boardSize === 100 ? '18px' : boardSize === 64 ? '22px' : '26px',
                          borderRadius: '50%',
                          background: p.color,
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: boardSize === 100 ? '0.6rem' : '0.72rem',
                          fontWeight: 800,
                          boxShadow: isActive ? '0 0 8px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.3)',
                          border: isActive ? '2px solid #FFFFFF' : '1px solid rgba(255,255,255,0.7)',
                          transform: isActive ? 'scale(1.1)' : 'scale(1)',
                          transition: 'transform 0.2s ease',
                          zIndex: isActive ? 2 : 1,
                        }}
                      >
                        {p.avatar ? (
                          <span style={{ fontSize: boardSize === 100 ? '0.65rem' : '0.8rem' }}>{p.avatar}</span>
                        ) : (
                          p.name[0]
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
