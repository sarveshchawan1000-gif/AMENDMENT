import React, { useState } from 'react';
import {
  BoardSize,
  DiceType,
  GameConfig,
  RuleMode,
  ThemeMode,
} from '../types/game';
import { BUNDLED_RULEBOOKS } from '../data/rulebooks';
import {
  Dices,
  Grid,
  Trophy,
  Users,
  ScrollText,
  Sparkles,
  Shuffle,
  ShieldCheck,
  Play,
  Cpu,
  Info,
} from 'lucide-react';

interface SetupScreenProps {
  onStartGame: (config: GameConfig) => void;
  currentTheme: ThemeMode;
  onThemeToggle: () => void;
}

const DEFAULT_PLAYER_COLORS = ['#C43D3D', '#2B6CB0', '#2E7D32', '#8C439F'];
const DEFAULT_AVATARS = ['⚖️', '📜', '🏛️', '🛡️'];

export const SetupScreen: React.FC<SetupScreenProps> = ({
  onStartGame,
  currentTheme,
}) => {
  const [boardSize, setBoardSize] = useState<BoardSize>(36);
  const [dice, setDice] = useState<DiceType>('1d6');
  const [winTarget, setWinTarget] = useState<number>(15);
  const [mode, setMode] = useState<RuleMode>('live');
  const [selectedRulebookIdx, setSelectedRulebookIdx] = useState<number>(0);

  // Players
  const [playerList, setPlayerList] = useState([
    { id: 'p1', name: 'Player 1', color: DEFAULT_PLAYER_COLORS[0], isGemma: false, avatar: DEFAULT_AVATARS[0] },
    { id: 'p2', name: 'Player 2', color: DEFAULT_PLAYER_COLORS[1], isGemma: false, avatar: DEFAULT_AVATARS[1] },
  ]);

  const [includeGemmaPlayer, setIncludeGemmaPlayer] = useState<boolean>(false);
  const [amendmentCadence, setAmendmentCadence] = useState<number>(1);
  const [simulateOffline, setSimulateOffline] = useState<boolean>(false);

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
          color: '#D4881A',
          isGemma: true,
          avatar: '🤖',
        };
      } else {
        finalPlayers.push({
          id: 'p-gemma',
          name: 'Gemma (AI)',
          color: '#D4881A',
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
      theme: currentTheme,
      selectedRulebookId: mode === 'hybrid' ? selectedRulebook.id : undefined,
      amendmentCadenceMoves: amendmentCadence,
      allowGemmaProposals: true,
      simulateOfflineModel: simulateOffline,
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
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          padding: '28px 32px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            opacity: 0.05,
            pointerEvents: 'none',
          }}
        >
          <ScrollText size={220} />
        </div>

        <div style={{ maxWidth: '680px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--accent-gold-subtle)',
              border: '1px solid var(--accent-gold)',
              color: 'var(--accent-gold)',
              fontSize: '0.78rem',
              fontWeight: 700,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            <ShieldCheck size={14} />
            Constitutional Game Setup
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.9rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              marginBottom: '10px',
            }}
          >
            Draft the Rules. Rewrite the Outcome.
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-editorial)',
              fontSize: '1.05rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            In AMENDMENT, you don’t merely roll and move. You propose laws in plain English for your own strategic advantage.
            The game’s AI judicial pipeline reviews your proposal against deterministic engine limits.
            <strong> There is no voting</strong>: if the proposal passes constitutional scrutiny, the engine enforces it.
          </p>
        </div>

        {/* Local Gemma Readiness Status Box */}
        <div
          style={{
            marginTop: '20px',
            background: simulateOffline ? 'var(--status-rejected-bg)' : 'var(--status-admitted-bg)',
            border: `1px solid ${simulateOffline ? 'var(--status-rejected-border)' : 'var(--status-admitted-border)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu
              size={20}
              style={{
                color: simulateOffline ? 'var(--status-rejected)' : 'var(--status-admitted)',
              }}
            />
            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: simulateOffline ? 'var(--status-rejected)' : 'var(--status-admitted)',
                }}
              >
                {simulateOffline
                  ? 'Local AI Status: Simulated Offline (Fallback Demonstration)'
                  : 'Local AI Status: Gemma 2B/7B Ready via Ollama'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Deterministic parser and schema 1.0 validator active. Strategic self-benefit rules are admitted.
              </div>
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={simulateOffline}
              onChange={(e) => setSimulateOffline(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Simulate Offline Model Failure
          </label>
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
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Grid size={18} style={{ color: 'var(--accent-burgundy)' }} />
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700 }}>
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
                  borderRadius: 'var(--radius-md)',
                  border: boardSize === size ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
                  background: boardSize === size ? 'var(--accent-burgundy-light)' : 'var(--bg-subtle)',
                  color: boardSize === size ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
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
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Dices size={18} style={{ color: 'var(--accent-burgundy)' }} />
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700 }}>
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
                  borderRadius: 'var(--radius-md)',
                  border: dice === d ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
                  background: dice === d ? 'var(--accent-burgundy-light)' : 'var(--bg-subtle)',
                  color: dice === d ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
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
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '20px',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={18} style={{ color: 'var(--accent-gold)' }} />
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700 }}>
                Points to Win
              </h3>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--accent-gold)',
              }}
            >
              {winTarget} pts
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={winTarget}
            onChange={(e) => setWinTarget(parseInt(e.target.value, 10))}
            style={{
              width: '100%',
              accentColor: 'var(--accent-gold)',
              cursor: 'pointer',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>5 (Blitz)</span>
            <span>15 (Standard)</span>
            <span>30 (Marathon)</span>
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          padding: '22px',
          marginBottom: '24px',
          boxShadow: 'var(--shadow-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <ScrollText size={18} style={{ color: 'var(--accent-burgundy)' }} />
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 700 }}>
            Rule Mode
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {/* Live Mode */}
          <div
            onClick={() => setMode('live')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              border: mode === 'live' ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
              background: mode === 'live' ? 'var(--accent-burgundy-light)' : 'var(--bg-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', color: mode === 'live' ? 'var(--accent-burgundy)' : 'var(--text-primary)' }}>
                Live Mode
              </span>
              <span style={{ fontSize: '0.68rem', padding: '2px 6px', background: 'var(--accent-gold)', color: '#fff', borderRadius: '4px', fontWeight: 700 }}>
                RECOMMENDED
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Rules evolve throughout play. Proposal window opens after player moves. Accepted rules take effect at the next-turn boundary.
            </p>
          </div>

          {/* Draft Mode */}
          <div
            onClick={() => setMode('draft')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              border: mode === 'draft' ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
              background: mode === 'draft' ? 'var(--accent-burgundy-light)' : 'var(--bg-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '6px', color: mode === 'draft' ? 'var(--accent-burgundy)' : 'var(--text-primary)' }}>
              Draft Mode
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Players submit proposed rules before the first roll. AI checks each individually. No voting. Match begins with compiled rulebook.
            </p>
          </div>

          {/* Hybrid Mode */}
          <div
            onClick={() => setMode('hybrid')}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              border: mode === 'hybrid' ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
              background: mode === 'hybrid' ? 'var(--accent-burgundy-light)' : 'var(--bg-subtle)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '6px', color: mode === 'hybrid' ? 'var(--accent-burgundy)' : 'var(--text-primary)' }}>
              Hybrid Mode
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
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
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-gold)', fontWeight: 700 }}>
                  Curated Rulebook Preview
                </span>
                <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 700 }}>
                  {selectedRulebook.title}
                </h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  {selectedRulebook.description} — By {selectedRulebook.author}
                </div>
              </div>
              <button
                type="button"
                onClick={handleRerollRulebook}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
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
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                  }}
                >
                  <strong style={{ color: 'var(--accent-burgundy)' }}>{rule.title}: </strong>
                  <span>{rule.readable_meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Cadence Selection */}
        {mode === 'live' && (
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            <Info size={15} style={{ color: 'var(--accent-gold)' }} />
            <span>Proposal Cadence:</span>
            <button
              type="button"
              onClick={() => setAmendmentCadence(1)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: amendmentCadence === 1 ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
                background: amendmentCadence === 1 ? 'var(--accent-burgundy-light)' : 'var(--bg-surface)',
                color: amendmentCadence === 1 ? 'var(--accent-burgundy)' : 'var(--text-primary)',
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
                border: amendmentCadence === 2 ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-subtle)',
                background: amendmentCadence === 2 ? 'var(--accent-burgundy-light)' : 'var(--bg-surface)',
                color: amendmentCadence === 2 ? 'var(--accent-burgundy)' : 'var(--text-primary)',
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
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          padding: '22px',
          marginBottom: '28px',
          boxShadow: 'var(--shadow-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} style={{ color: 'var(--accent-burgundy)' }} />
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 700 }}>
              Legislators (Players)
            </h3>
          </div>
          {playerList.length < 4 && (
            <button
              type="button"
              onClick={handleAddPlayer}
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-subtle)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
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
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
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
                  borderBottom: '1px solid var(--border-subtle)',
                  padding: '4px 6px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  outline: 'none',
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
            borderRadius: 'var(--radius-md)',
            background: includeGemmaPlayer ? 'var(--accent-gold-subtle)' : 'transparent',
            border: `1px solid ${includeGemmaPlayer ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.3rem' }}>🤖</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Enable Gemma AI Opponent
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Adds an autonomous Gemma player that rolls, takes turns, and submits strategic self-benefiting proposals.
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={includeGemmaPlayer}
            onChange={(e) => setIncludeGemmaPlayer(e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-gold)' }}
          />
        </div>
      </div>

      {/* Start Button */}
      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <button
          type="button"
          onClick={handleStart}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px 42px',
            borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, var(--accent-burgundy), #5A1212)',
            color: '#FAF7F2',
            fontSize: '1.05rem',
            fontFamily: 'var(--font-serif)',
            fontWeight: 800,
            letterSpacing: '0.08em',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(139, 30, 30, 0.35)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <Play size={20} fill="#FAF7F2" />
          START MATCH
        </button>
      </div>
    </div>
  );
};
