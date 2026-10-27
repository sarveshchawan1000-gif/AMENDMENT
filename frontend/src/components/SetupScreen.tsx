import React, { useState, useEffect } from 'react';
import {
  BoardSize,
  DiceType,
  GameConfig,
  RuleMode,
  BundledRulebook,
} from '../types/game';
import { BUNDLED_RULEBOOKS, CANONICAL_STARTER_SUGGESTIONS } from '../data/rulebooks';
import {
  fetchCourtHealth,
  CourtHealth,
  fetchRulebooks,
  fetchPredefinedRules,
  PredefinedCatalogRule,
} from '../services/gameApi';
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
  BookOpen,
  Check,
  Search,
  Sliders,
} from 'lucide-react';

interface SetupScreenProps {
  onStartGame: (config: GameConfig) => void;
}

const DEFAULT_PLAYER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
const DEFAULT_AVATARS = ['⚖️', '📜', '🏛️', '🛡️'];

export const SetupScreen: React.FC<SetupScreenProps> = ({ onStartGame }) => {
  const [boardSize, setBoardSize] = useState<BoardSize>(36);
  const [dice, setDice] = useState<DiceType>('1d6');
  const [winTarget, setWinTarget] = useState<number>(21);
  const [mode, setMode] = useState<RuleMode>('live');
  const [selectedRulebookIdx, setSelectedRulebookIdx] = useState<number>(0);
  const [rulebooksList, setRulebooksList] = useState<BundledRulebook[]>(BUNDLED_RULEBOOKS);
  const [catalogRules, setCatalogRules] = useState<PredefinedCatalogRule[]>([]);
  const [hybridSelectionMode, setHybridSelectionMode] = useState<'preset' | 'custom'>('preset');
  const [customSelectedRuleIds, setCustomSelectedRuleIds] = useState<string[]>(['AMEND_001', 'AMEND_009']);
  const [customCategoryFilter, setCustomCategoryFilter] = useState<string>('all');
  const [customSearchQuery, setCustomSearchQuery] = useState<string>('');

  // Players
  const [playerList, setPlayerList] = useState([
    { id: 'p1', name: 'Player 1', color: DEFAULT_PLAYER_COLORS[0], isGemma: false, avatar: DEFAULT_AVATARS[0] },
    { id: 'p2', name: 'Player 2', color: DEFAULT_PLAYER_COLORS[1], isGemma: false, avatar: DEFAULT_AVATARS[1] },
  ]);

  const [includeGemmaPlayer, setIncludeGemmaPlayer] = useState<boolean>(false);
  const [amendmentCadence, setAmendmentCadence] = useState<number>(1);
  const [courtHealth, setCourtHealth] = useState<CourtHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    fetchCourtHealth()
      .then((data) => setCourtHealth(data))
      .catch((err) => {
        setHealthError(err instanceof Error ? err.message : 'Could not connect to backend');
      });

    fetchRulebooks()
      .then((backendBooks) => {
        if (backendBooks && backendBooks.length > 0) {
          const converted: BundledRulebook[] = backendBooks.map((bb) => {
            const bundledMatch = BUNDLED_RULEBOOKS.find((b) => b.id === bb.id || b.title === bb.name);
            return {
              id: bb.id,
              title: bb.name,
              subtitle: bundledMatch?.subtitle || 'Curated amendment accord',
              description: bundledMatch?.description || `Curated rule collection featuring ${bb.rules.length} amendments.`,
              author: bundledMatch?.author || 'High Council',
              compatible_board_sizes: (bb.board_sizes as any) || [36, 64, 100],
              rules: bb.rules.map((r, rIdx) => ({
                id: r.id || `AMEND_${String(rIdx + 1).padStart(3, '0')}`,
                schema_version: '1.0' as const,
                title: r.title || r.source || `Rule ${rIdx + 1}`,
                original_text: r.source || '',
                normalized_rule: r.description || r.source || '',
                readable_meaning: r.description || r.source || '',
                trigger: r.trigger as any,
                condition: (typeof r.condition === 'string' ? r.condition : (r.condition as any)?.predicates?.[0]?.name || 'always') as any,
                effect: (typeof r.effect === 'string' ? r.effect : (r.effect as any)?.type || 'add_score') as any,
                effect_value: (r.effect as any)?.amount || 1,
                target: (r.effect as any)?.target === 'leader' ? 'leader' : (r.effect as any)?.target === 'last' ? 'last_place' : 'active_player',
                duration: 'permanent' as const,
                activation_boundary: 'immediate' as const,
                status: 'active' as const,
                is_base_rule: false,
              })),
            };
          });
          setRulebooksList(converted);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch backend rulebooks, using bundled:', err);
      });

    fetchPredefinedRules()
      .then((rules) => {
        if (rules && rules.length > 0) {
          setCatalogRules(rules);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch backend predefined rules:', err);
      });
  }, []);

  const selectedRulebook = rulebooksList[selectedRulebookIdx % rulebooksList.length] || rulebooksList[0] || BUNDLED_RULEBOOKS[0];

  const handleRerollRulebook = () => {
    setSelectedRulebookIdx((prev) => (prev + 1) % rulebooksList.length);
  };

  const handleRerollCustomPair = () => {
    const pool = catalogRules.length > 0 ? catalogRules : CANONICAL_STARTER_SUGGESTIONS;
    if (pool.length < 2) return;
    const firstIdx = Math.floor(Math.random() * pool.length);
    let secondIdx = Math.floor(Math.random() * pool.length);
    while (secondIdx === firstIdx && pool.length > 1) {
      secondIdx = Math.floor(Math.random() * pool.length);
    }
    setCustomSelectedRuleIds([pool[firstIdx].id, pool[secondIdx].id]);
  };

  const toggleRuleSelection = (ruleId: string) => {
    setCustomSelectedRuleIds((prev) => {
      if (prev.includes(ruleId)) {
        return prev.filter((id) => id !== ruleId);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), ruleId];
      }
      return [...prev, ruleId];
    });
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

    const isCustom = mode === 'hybrid' && hybridSelectionMode === 'custom' && customSelectedRuleIds.length > 0;
    const config: GameConfig = {
      boardSize,
      dice,
      winTarget,
      players: finalPlayers,
      mode,
      theme: 'light',
      selectedRulebookId: mode === 'hybrid' && !isCustom ? selectedRulebook.id : undefined,
      selectedStartingRuleIds: mode === 'hybrid' && isCustom ? customSelectedRuleIds : undefined,
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

      {/* Court AI Status Banner */}
      <div
        className="panel"
        style={{
          marginBottom: '20px',
          padding: '12px 18px',
          borderRadius: 'var(--radius)',
          background:
            courtHealth?.ollama_reachable && courtHealth?.model_installed
              ? 'rgba(34, 197, 94, 0.08)'
              : 'rgba(234, 179, 8, 0.1)',
          border: `1px solid ${
            courtHealth?.ollama_reachable && courtHealth?.model_installed
              ? 'rgba(34, 197, 94, 0.3)'
              : 'rgba(234, 179, 8, 0.4)'
          }`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>
            {courtHealth?.ollama_reachable && courtHealth?.model_installed ? '🏛️' : '⚠️'}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
              Court AI Engine:{' '}
              {courtHealth
                ? `${courtHealth.provider} (${courtHealth.model})`
                : healthError
                ? 'Backend Offline'
                : 'Checking status...'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {courtHealth?.ollama_reachable && courtHealth?.model_installed ? (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                  ✓ Local AI ready — amendments will be judged by {courtHealth.model}
                </span>
              ) : courtHealth?.ollama_reachable && !courtHealth?.model_installed ? (
                <span style={{ color: '#d97706', fontWeight: 600 }}>
                  Model not installed. Run in your terminal:{' '}
                  <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                    ollama pull {courtHealth.model}
                  </code>
                </span>
              ) : courtHealth && !courtHealth.ollama_reachable ? (
                <span style={{ color: '#dc2626', fontWeight: 600 }}>
                  Ollama is not running. Start it with:{' '}
                  <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: '4px' }}>
                    ollama serve
                  </code>
                </span>
              ) : healthError ? (
                <span style={{ color: '#dc2626' }}>
                  Cannot connect to backend server
                </span>

              ) : (
                'Connecting to Court AI health endpoint...'
              )}
            </div>
          </div>
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
          
          {/* Stepper Control */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '16px',
            padding: '12px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--line)',
          }}>
            <button
              type="button"
              onClick={() => setWinTarget(Math.max(21, winTarget - 1))}
              disabled={winTarget <= 21}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: winTarget <= 21 ? 'var(--surface)' : 'var(--surface-2)',
                color: winTarget <= 21 ? 'var(--text-muted)' : 'var(--text)',
                fontSize: '1.5rem',
                fontWeight: 700,
                cursor: winTarget <= 21 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                opacity: winTarget <= 21 ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (winTarget > 21) {
                  e.currentTarget.style.background = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent-contrast)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }
              }}
              onMouseLeave={(e) => {
                if (winTarget > 21) {
                  e.currentTarget.style.background = 'var(--surface-2)';
                  e.currentTarget.style.color = 'var(--text)';
                  e.currentTarget.style.borderColor = 'var(--line)';
                }
              }}
            >
              −
            </button>
            
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              fontWeight: 800,
              color: 'var(--accent)',
              minWidth: '80px',
              textAlign: 'center',
              letterSpacing: '0.05em',
            }}>
              {winTarget}
            </div>
            
            <button
              type="button"
              onClick={() => setWinTarget(Math.min(64, winTarget + 1))}
              disabled={winTarget >= 64}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: winTarget >= 64 ? 'var(--surface)' : 'var(--surface-2)',
                color: winTarget >= 64 ? 'var(--text-muted)' : 'var(--text)',
                fontSize: '1.5rem',
                fontWeight: 700,
                cursor: winTarget >= 64 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                opacity: winTarget >= 64 ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (winTarget < 64) {
                  e.currentTarget.style.background = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent-contrast)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }
              }}
              onMouseLeave={(e) => {
                if (winTarget < 64) {
                  e.currentTarget.style.background = 'var(--surface-2)';
                  e.currentTarget.style.color = 'var(--text)';
                  e.currentTarget.style.borderColor = 'var(--line)';
                }
              }}
            >
              +
            </button>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            <span>21 (Quick)</span>
            <span>42 (Standard)</span>
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

        {/* Hybrid Rule Selection Panel */}
        {mode === 'hybrid' && (() => {
          const getCategoryColor = (category?: string) => {
            switch (category?.toLowerCase()) {
              case 'scoring':
                return { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--ok)' };
              case 'movement':
                return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: 'var(--accent)' };
              case 'catch_up':
                return { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' };
              case 'disruption':
                return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--danger)' };
              case 'endgame':
                return { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' };
              default:
                return { bg: 'var(--surface)', border: 'var(--line)', text: 'var(--text-muted)' };
            }
          };

          const allAvailableCatalog = catalogRules.length > 0 ? catalogRules : CANONICAL_STARTER_SUGGESTIONS.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            category: s.category,
            rule_payload: { trigger: 'on_land', condition: {}, effect: {} },
          }));

          const filteredCatalogRules = allAvailableCatalog.filter((r) => {
            if (customCategoryFilter !== 'all' && r.category?.toLowerCase() !== customCategoryFilter) {
              return false;
            }
            if (customSearchQuery.trim()) {
              const q = customSearchQuery.trim().toLowerCase();
              const matchId = r.id.toLowerCase().includes(q);
              const matchTitle = r.title.toLowerCase().includes(q);
              const matchDesc = r.description.toLowerCase().includes(q);
              return matchId || matchTitle || matchDesc;
            }
            return true;
          });

          const customSelectedRulesDetails = customSelectedRuleIds.map((rid) => {
            const found = allAvailableCatalog.find((r) => r.id === rid);
            if (found) {
              return { id: found.id, title: found.title, description: found.description, category: found.category };
            }
            const inBooks = rulebooksList.flatMap((b) => b.rules).find((r) => r.id === rid);
            if (inBooks) {
              return { id: inBooks.id, title: inBooks.title, description: inBooks.readable_meaning, category: 'general' };
            }
            return { id: rid, title: `Amendment ${rid}`, description: `Canonical rule ${rid}`, category: 'general' };
          });

          return (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
              }}
            >
              {/* Header Mode Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setHybridSelectionMode('preset')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: hybridSelectionMode === 'preset' ? '1px solid var(--accent)' : '1px solid var(--line)',
                      background: hybridSelectionMode === 'preset' ? 'var(--accent)' : 'var(--surface)',
                      color: hybridSelectionMode === 'preset' ? 'var(--accent-contrast)' : 'var(--text)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <BookOpen size={14} />
                    Curated Rulebooks ({rulebooksList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHybridSelectionMode('custom')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: hybridSelectionMode === 'custom' ? '1px solid var(--accent)' : '1px solid var(--line)',
                      background: hybridSelectionMode === 'custom' ? 'var(--accent)' : 'var(--surface)',
                      color: hybridSelectionMode === 'custom' ? 'var(--accent-contrast)' : 'var(--text)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Sliders size={14} />
                    Custom Rules ({customSelectedRuleIds.length} Selected)
                  </button>
                </div>

                {hybridSelectionMode === 'preset' ? (
                  <button
                    type="button"
                    onClick={handleRerollRulebook}
                    className="btn btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <Shuffle size={14} />
                    Reroll Rulebook
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleRerollCustomPair}
                      className="btn btn-secondary"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <Shuffle size={14} />
                      Random Pair
                    </button>
                    {customSelectedRuleIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomSelectedRuleIds([])}
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 10px',
                          fontSize: '0.78rem',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* PRESET VIEW */}
              {hybridSelectionMode === 'preset' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--accent-2)', fontWeight: 700 }}>
                        Active Curated Rulebook
                      </span>
                      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: '2px 0 0 0' }}>
                        {selectedRulebook.title}
                      </h4>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                        {selectedRulebook.description} — By {selectedRulebook.author}
                      </div>
                    </div>

                    <select
                      value={selectedRulebook.id}
                      onChange={(e) => {
                        const idx = rulebooksList.findIndex((b) => b.id === e.target.value);
                        if (idx !== -1) setSelectedRulebookIdx(idx);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        border: '1px solid var(--line)',
                        fontSize: '0.8rem',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {rulebooksList.map((rb) => (
                        <option key={rb.id} value={rb.id}>
                          {rb.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
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
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: 'var(--accent)',
                            marginRight: '6px',
                          }}
                        >
                          {rule.id}
                        </span>
                        <strong style={{ color: 'var(--text)' }}>{rule.title}: </strong>
                        <span style={{ color: 'var(--text-muted)' }}>{rule.readable_meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CUSTOM VIEW */}
              {hybridSelectionMode === 'custom' && (
                <div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-2)', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Selected Starting Rules ({customSelectedRuleIds.length} of 4)
                    </div>
                    {customSelectedRulesDetails.length === 0 ? (
                      <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px dashed var(--line)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        No starting rules selected. Choose 1 to 4 rules below from the 100 canonical amendments.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {customSelectedRulesDetails.map((rule) => {
                          const badge = getCategoryColor(rule.category);
                          return (
                            <div
                              key={rule.id}
                              style={{
                                padding: '8px 12px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--surface)',
                                border: '1px solid var(--accent)',
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: badge.bg,
                                    color: badge.text,
                                    marginRight: '6px',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {rule.category?.replace('_', ' ') || 'RULE'}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: 'var(--accent)', marginRight: '6px' }}>
                                  {rule.id}
                                </span>
                                <strong style={{ color: 'var(--text)' }}>{rule.title}: </strong>
                                <span style={{ color: 'var(--text-muted)' }}>{rule.description}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleRuleSelection(rule.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--danger)',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Filter & Search Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {['all', 'scoring', 'movement', 'catch_up', 'disruption', 'endgame'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCustomCategoryFilter(cat)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: customCategoryFilter === cat ? '1px solid var(--accent)' : '1px solid var(--line)',
                            background: customCategoryFilter === cat ? 'var(--accent)' : 'var(--surface)',
                            color: customCategoryFilter === cat ? 'var(--accent-contrast)' : 'var(--text-muted)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                          }}
                        >
                          {cat.replace('_', ' ')}
                        </button>
                      ))}
                    </div>

                    <div style={{ position: 'relative', minWidth: '160px' }}>
                      <input
                        type="text"
                        value={customSearchQuery}
                        onChange={(e) => setCustomSearchQuery(e.target.value)}
                        placeholder="Search rules..."
                        style={{
                          width: '100%',
                          padding: '4px 8px 4px 24px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          fontSize: '0.75rem',
                          outline: 'none',
                        }}
                      />
                      <Search size={12} style={{ position: 'absolute', left: '7px', top: '7px', color: 'var(--text-muted)' }} />
                    </div>
                  </div>

                  {/* Catalog Rule Browser */}
                  <div
                    style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      paddingRight: '4px',
                    }}
                  >
                    {filteredCatalogRules.map((r) => {
                      const isSelected = customSelectedRuleIds.includes(r.id);
                      const badge = getCategoryColor(r.category);

                      return (
                        <div
                          key={r.id}
                          onClick={() => toggleRuleSelection(r.id)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            background: isSelected ? 'var(--surface)' : 'var(--surface-2)',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  padding: '1px 4px',
                                  borderRadius: '3px',
                                  background: badge.bg,
                                  color: badge.text,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {r.category?.replace('_', ' ') || 'RULE'}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {r.id}
                              </span>
                              <strong style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                                {r.title}
                              </strong>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                              {r.description}
                            </div>
                          </div>

                          <div
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                              background: isSelected ? 'var(--accent)' : 'var(--surface)',
                              color: 'var(--accent-contrast)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
