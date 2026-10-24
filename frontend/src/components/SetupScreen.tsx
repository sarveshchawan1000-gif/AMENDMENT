import React, { useState } from 'react';
import {
  BoardSize,
  DiceType,
  GameConfig,
  RuleMode,
} from '../types/game';
import { BUNDLED_RULEBOOKS } from '../data/rulebooks';
import {
  Dices,
  Grid,
  Trophy,
  Users,
  ScrollText,
  Shuffle,
  ShieldCheck,
  Play,
  Info,
} from 'lucide-react';

interface SetupScreenProps {
  onStartGame: (config: GameConfig) => void;
}

const DEFAULT_PLAYER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
const DEFAULT_AVATARS = ['⚖️', '📜', '🏛️', '🛡️'];

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartGame }) => {
  const [boardSize, setBoardSize] = useState<BoardSize>(36);
  const [dice, setDice] = useState<DiceType>('1d6');
  const [winTarget, setWinTarget] = useState<number>(50);
  const [mode, setMode] = useState<RuleMode>('live');
  const [selectedRulebookIdx, setSelectedRulebookIdx] = useState<number>(0);

  // Players
  const [playerList, setPlayerList] = useState([
    { id: 'p1', name: 'Player 1', color: DEFAULT_PLAYER_COLORS[0], isGemma: false, avatar: DEFAULT_AVATARS[0] },
    { id: 'p2', name: 'Player 2', color: DEFAULT_PLAYER_COLORS[1], isGemma: false, avatar: DEFAULT_AVATARS[1] },
  ]);

  const [includeGemmaPlayer, setIncludeGemmaPlayer] = useState<boolean>(false);
  const [amendmentCadence, setAmendmentCadence] = useState<number>(1);

  const selectedRulebook = BUNDLED_RULEBOOKS[selectedRulebookIdx];

  const handleRerollRulebook = () => {
    setSelectedRulebookIdx((prev) => (prev + 1) % BUNDLED_RULEBOOKS.length);
  };

  const handleAddPlayer = () => {
    if (playerList.length < 4) {
      const idx = playerList.length;
      setPlayerList([
        ...playerList,
        {
          id: `p${idx + 1}`,
          name: `Player ${idx + 1}`,
          color: DEFAULT_PLAYER_COLORS[idx % DEFAULT_PLAYER_COLORS.length],
          isGemma: false,
          avatar: DEFAULT_AVATARS[idx % DEFAULT_AVATARS.length],
        },
      ]);
    }
  };

  const handleRemovePlayer = (idx: number) => {
    if (playerList.length > 2) {
      setPlayerList(playerList.filter((_, i) => i !== idx));
    }
  };

  const handleNameChange = (idx: number, name: string) => {
    const updated = [...playerList];
    updated[idx].name = name;
    setPlayerList(updated);
  };

  const handleStart = () => {
    let finalPlayers = [...playerList];
    if (includeGemmaPlayer && !finalPlayers.some((p) => p.isGemma)) {
      if (finalPlayers.length >= 4) {
        finalPlayers[finalPlayers.length - 1] = {
          id: 'p-gemma',
          name: 'Gemma (AI)',
          color: 'var(--accent-2)',
          isGemma: true,
          avatar: '🤖',
        };
      } else {
        finalPlayers.push({
          id: 'p-gemma',
          name: 'Gemma (AI)',
          color: 'var(--accent-2)',
          isGemma: true,
          avatar: '🤖',
        });
      }
    }

    const config: GameConfig = {
      boardSize,
      dice,
      winTarget,
      players: finalPlayers,
      mode,
      theme: 'light',
      selectedRulebookId: mode === 'hybrid' ? selectedRulebook.id : undefined,
      amendmentCadenceMoves: amendmentCadence,
      allowGemmaProposals: true,
      simulateOfflineModel: false,
    };

    onStartGame(config);
  };

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '32px auto',
        padding: '0 20px',
      }}
    >
      {/* Hero Welcome Banner */}
      <div
        className="panel"
        style={{
          padding: '28px 32px',
          marginBottom: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ maxWidth: '680px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--accent-2)',
              color: 'var(--accent-2)',
              fontSize: '0.78rem',
              fontWeight: 700,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-display)',
            }}
          >
            <ShieldCheck size={14} />
            Constitutional Game Setup
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.9rem',
              fontWeight: 800,
              color: 'var(--text)',
              lineHeight: 1.2,
              marginBottom: '10px',
            }}
          >
            Draft the Rules. Rewrite the Outcome.
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1.05rem',
              color: 'var(--text-muted)',
              lineHeight: 1.6,
            }}
          >
            Every player is a lawmaker. Propose a rule that tilts the game your way, and if it passes review, it becomes law. <strong>No voting</strong>, only cunning.
          </p>
        </div>
      </div>


      {/* Grid of Settings */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '24px',
        }}
      >
        {/* Board Size */}
        <div
          className="panel"
          style={{
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Grid size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
              Board Size
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {([36, 64, 100] as BoardSize[]).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBoardSize(size)}
                style={{
                  padding: '10px 4px',
                  borderRadius: 'var(--radius-sm)',
                  border: boardSize === size ? '2px solid var(--accent)' : '1px solid var(--line)',
                  background: boardSize === size ? 'var(--surface-2)' : 'var(--surface)',
                  color: boardSize === size ? 'var(--accent)' : 'var(--text)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-display)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div>{size} Tiles</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {size === 36 ? 'Fast (6x6)' : size === 64 ? 'Classic (8x8)' : 'Grand (10x10)'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dice Selection */}
        <div
          className="panel"
          style={{
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Dices size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
              Dice Configuration
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {(['1d6', '2d6', '1d12'] as DiceType[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDice(d)}
                style={{
                  padding: '10px 4px',
                  borderRadius: 'var(--radius-sm)',
                  border: dice === d ? '2px solid var(--accent)' : '1px solid var(--line)',
                  background: dice === d ? 'var(--surface-2)' : 'var(--surface)',
                  color: dice === d ? 'var(--accent)' : 'var(--text)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-display)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div>{d}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {d === '1d6' ? 'Range 1–6' : d === '2d6' ? 'Range 2–12' : 'Range 1–12'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Win Target */}
        <div
          className="panel"
          style={{
            padding: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={18} style={{ color: 'var(--accent-2)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
                Points to Win
              </h3>
            </div>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--accent-2)',
              }}
            >
              {winTarget} pts
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={64}
            step={1}
            value={winTarget}
            onChange={(e) => setWinTarget(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>1 (Blitz)</span>
            <span>32 (Standard)</span>
            <span>64 (Marathon)</span>
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div
        className="panel"
        style={{
          padding: '22px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <ScrollText size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700 }}>
            Rule Mode
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {/* Live Mode */}
          <div
            onClick={() => setMode('live')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius)',
              border: mode === 'live' ? '2px solid var(--accent)' : '1px solid var(--line)',
              background: mode === 'live' ? 'var(--surface-2)' : 'var(--surface)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  fontFamily: 'var(--font-display)',
                  color: mode === 'live' ? 'var(--accent)' : 'var(--text)',
                }}
              >
                Live Mode
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                }}
              >
                RECOMMENDED
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Rules evolve throughout play. Proposal window opens after player moves. Accepted rules take effect at the next-turn boundary.
            </p>
          </div>

          {/* Draft Mode */}
          <div
            onClick={() => setMode('draft')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius)',
              border: mode === 'draft' ? '2px solid var(--accent)' : '1px solid var(--line)',
              background: mode === 'draft' ? 'var(--surface-2)' : 'var(--surface)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: '0.95rem',
                marginBottom: '6px',
                fontFamily: 'var(--font-display)',
                color: mode === 'draft' ? 'var(--accent)' : 'var(--text)',
              }}
            >
              Draft Mode
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Players submit proposed rules before the first roll. AI checks each individually. No voting. Match begins with compiled rulebook.
            </p>
          </div>

          {/* Hybrid Mode */}
          <div
            onClick={() => setMode('hybrid')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius)',
              border: mode === 'hybrid' ? '2px solid var(--accent)' : '1px solid var(--line)',
              background: mode === 'hybrid' ? 'var(--surface-2)' : 'var(--surface)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: '0.95rem',
                marginBottom: '6px',
                fontFamily: 'var(--font-display)',
                color: mode === 'hybrid' ? 'var(--accent)' : 'var(--text)',
              }}
            >
              Hybrid Mode
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Loads a bundled curated rulebook from the library (e.g., Prime Tax, Catch-Up Doctrine). Host can preview and reroll.
            </p>
          </div>
        </div>

        {/* Hybrid Rulebook Preview Box */}
        {mode === 'hybrid' && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-2)', fontWeight: 700 }}>
                  Curated Rulebook Preview
                </span>
                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {selectedRulebook.title}
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {selectedRulebook.description} — By {selectedRulebook.author}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRerollRulebook}
                className="btn btn-secondary"
                style={{
                  padding: '8px 12px',
                  fontSize: '0.78rem',
                }}
              >
                <Shuffle size={14} />
                Reroll Rulebook
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {selectedRulebook.rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    fontSize: '0.8rem',
                  }}
                >
                  <strong style={{ color: 'var(--accent)' }}>{rule.title}: </strong>
                  <span style={{ color: 'var(--text)' }}>{rule.readable_meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Cadence Selection */}
        {mode === 'live' && (
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <Info size={15} style={{ color: 'var(--accent-2)' }} />
            <span>Proposal Cadence:</span>
            <button
              type="button"
              onClick={() => setAmendmentCadence(1)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: amendmentCadence === 1 ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: amendmentCadence === 1 ? 'var(--surface-2)' : 'var(--surface)',
                color: amendmentCadence === 1 ? 'var(--accent)' : 'var(--text)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Every Move
            </button>
            <button
              type="button"
              onClick={() => setAmendmentCadence(2)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: amendmentCadence === 2 ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: amendmentCadence === 2 ? 'var(--surface-2)' : 'var(--surface)',
                color: amendmentCadence === 2 ? 'var(--accent)' : 'var(--text)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Every 2 Moves
            </button>
          </div>
        )}
      </div>

      {/* Players Setup */}
      <div
        className="panel"
        style={{
          padding: '22px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700 }}>
              Legislators (Players)
            </h3>
          </div>
          {playerList.length < 4 && (
            <button
              type="button"
              onClick={handleAddPlayer}
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem',
                padding: '6px 12px',
              }}
            >
              + Add Player
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {playerList.map((player, idx) => (
            <div
              key={player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius)',
                border: `2px solid ${player.color}`,
              }}
            >
              <span style={{ fontSize: '1.2rem' }}>{player.avatar}</span>
              <input
                type="text"
                value={player.name}
                onChange={(e) => handleNameChange(idx, e.target.value)}
                maxLength={18}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--line)',
                  padding: '4px 6px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
              {playerList.length > 2 && (
                <button
                  type="button"
                  onClick={() => handleRemovePlayer(idx)}
                  title="Remove player"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Optional Gemma AI Opponent */}
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: includeGemmaPlayer ? 'var(--surface-2)' : 'transparent',
            border: `1px solid ${includeGemmaPlayer ? 'var(--accent-2)' : 'var(--line)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>🤖</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Enable Gemma AI Opponent
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Adds an autonomous Gemma player that rolls, takes turns, and submits strategic self-benefiting proposals.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={includeGemmaPlayer}
            onChange={(e) => setIncludeGemmaPlayer(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
        </div>
      </div>

      {/* Start Button */}
      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <button
          type="button"
          onClick={handleStart}
          className="btn btn-accent"
          style={{
            padding: '16px 42px',
            fontSize: '1.05rem',
            letterSpacing: '0.08em',
          }}
        >
          <Play size={20} fill="currentColor" />
          START MATCH
        </button>
      </div>
    </div>
  );
};
