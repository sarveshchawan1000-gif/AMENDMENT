/**
 * LobbyScreen for AMENDMENT
 * Displays large room code, copy code/link buttons, live player list via WebSocket
 * with exponential backoff reconnect and polling fallback (every 2s), host badges,
 * host-only Start Game button, and game_started navigation hook.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RoomState,
  RoomPlayer,
  getRoom,
  leaveRoom,
  startRoom,
  ApiError
} from '../api/client';
import { useSession } from '../store/session';
import {
  Crown,
  Copy,
  Check,
  Link,
  Users,
  Play,
  LogOut,
  Wifi,
  WifiOff,
  AlertCircle,
  Sparkles,
  Clock
} from 'lucide-react';

export const GAME_ROUTE = '/game/:roomCode';

interface LobbyScreenProps {
  initialRoom: RoomState;
  onLeaveRoom: () => void;
  onGameStarted: (roomCode: string, players: RoomPlayer[]) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  initialRoom,
  onLeaveRoom,
  onGameStarted,
}) => {
  const { user, token } = useSession();

  const [room, setRoom] = useState<RoomState>(initialRoom);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'fallback_polling'
  >('connected');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<any>(null);
  const pollingIntervalRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  const isLeavingRef = useRef<boolean>(false);

  const isHost = user?.player_id === room.host_id;
  const playerCount = room.players?.length ?? 0;
  const canStart = playerCount >= 2;
  const maxPlayers = room.max_players || 6;

  // Polling fallback mechanism
  const startPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) return;
    setConnectionStatus('fallback_polling');

    pollingIntervalRef.current = setInterval(async () => {
      if (isLeavingRef.current) return;
      try {
        const latest = await getRoom(room.room_code);
        setRoom(latest);
        if (latest.status === 'started') {
          onGameStarted(latest.room_code, latest.players);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.code === 'ROOM_NOT_FOUND') {
          setErrorMessage('This chamber has been disbanded.');
        }
      }
    }, 2000);
  }, [room.room_code, onGameStarted]);

  const stopPollingFallback = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // WebSocket Connection Lifecycle
  const connectWebSocket = useCallback(() => {
    if (isLeavingRef.current || typeof window === 'undefined') return;

    let wsBase = (
      import.meta.env.VITE_API_URL ??
      import.meta.env.VITE_API_BASE_URL ??
      ''
    ).trim();

    if (!wsBase) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsBase = `${protocol}//${window.location.host}`;
    } else if (wsBase.startsWith('https://')) {
      wsBase = wsBase.replace('https://', 'wss://');
    } else if (wsBase.startsWith('http://')) {
      wsBase = wsBase.replace('http://', 'ws://');
    }

    const wsUrl = `${wsBase}/rooms/${encodeURIComponent(room.room_code)}/ws?token=${encodeURIComponent(token || '')}`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttemptRef.current = 0;
        stopPollingFallback();

        // 15s ping heartbeat
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'lobby_update') {
            setRoom((prev) => ({
              ...prev,
              host_id: data.host_id,
              status: data.status,
              players: data.players,
              can_start: data.can_start,
            }));
          } else if (data.type === 'game_started') {
            setRoom((prev) => ({ ...prev, status: 'started', players: data.players }));
            onGameStarted(room.room_code, data.players || room.players);
          }
        } catch {
          // parse error
        }
      };

      ws.onerror = () => {
        // Trigger fallback polling while reconnecting
        startPollingFallback();
      };

      ws.onclose = () => {
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

        if (!isLeavingRef.current) {
          setConnectionStatus('reconnecting');
          startPollingFallback();

          // Exponential backoff: min(1000 * 1.5^attempts, 10000)
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptRef.current), 10000);
          reconnectAttemptRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };
    } catch {
      startPollingFallback();
    }
  }, [room.room_code, token, onGameStarted, startPollingFallback, stopPollingFallback]);

  useEffect(() => {
    isLeavingRef.current = false;
    connectWebSocket();

    return () => {
      isLeavingRef.current = true;
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      stopPollingFallback();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connectWebSocket, stopPollingFallback]);

  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(room.room_code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = room.room_code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback alert
      window.prompt('Copy Room Code:', room.room_code);
    }
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/join/${room.room_code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      window.prompt('Copy Invitation Link:', link);
    }
  };

  const handleLeave = async () => {
    const confirmed = window.confirm('Are you sure you wish to leave this chamber?');
    if (!confirmed) return;

    isLeavingRef.current = true;
    try {
      await leaveRoom(room.room_code);
    } catch {
      // Ignore network errors when departing
    } finally {
      onLeaveRoom();
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !canStart) return;

    setIsStarting(true);
    setErrorMessage(null);

    try {
      await startRoom(room.room_code);
      onGameStarted(room.room_code, room.players);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to start game.');
      }
      setIsStarting(false);
    }
  };

  const emptySeats = Math.max(0, maxPlayers - (room.players?.length || 0));

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '840px',
        margin: '0 auto',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Banner: Room Code, Copy Buttons, and Connection Indicator */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '24px 28px',
          boxShadow: 'var(--panel-shadow)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            Chamber Code
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2.5rem',
                fontWeight: 900,
                letterSpacing: '0.14em',
                color: 'var(--accent)',
              }}
            >
              {room.room_code}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copy 6-digit Chamber Code"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: copiedCode ? 'var(--ok, #16A34A)' : 'var(--surface-2)',
                  color: copiedCode ? '#FFFFFF' : 'var(--text)',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                title="Copy Direct Invitation Link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--line)',
                  background: copiedLink ? 'var(--ok, #16A34A)' : 'var(--surface-2)',
                  color: copiedLink ? '#FFFFFF' : 'var(--text)',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedLink ? <Check size={16} /> : <Link size={16} />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Indicators & Leave Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: connectionStatus === 'connected' ? 'var(--ok, #16A34A)' : 'var(--text-muted)',
            }}
          >
            {connectionStatus === 'connected' ? (
              <>
                <Wifi size={14} />
                <span>Live Sync</span>
              </>
            ) : connectionStatus === 'fallback_polling' ? (
              <>
                <Clock size={14} />
                <span>Polling (2s)</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span>Reconnecting...</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleLeave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--text-muted)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.84rem',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
          >
            <LogOut size={16} />
            <span>Leave Chamber</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            fontSize: '0.88rem',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Seated Legislators Roster Card */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          padding: '26px 28px',
          boxShadow: 'var(--panel-shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
              Seated Legislators ({playerCount}/{maxPlayers})
            </h2>
          </div>
          {!canStart && (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Waiting for at least 2 players...
            </span>
          )}
        </div>

        {/* Player Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {room.players?.map((player: RoomPlayer, idx: number) => {
            const isMe = player.player_id === user?.player_id;
            return (
              <div
                key={player.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: 'var(--radius-sm)',
                  background: isMe ? 'rgba(47, 91, 255, 0.08)' : 'var(--surface-2)',
                  border: isMe ? '1px solid var(--accent)' : '1px solid var(--line)',
                  animation: 'fadeIn 0.25s ease-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: player.is_host
                        ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                        : 'var(--surface)',
                      color: player.is_host ? '#FFFFFF' : 'var(--text)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      overflow: 'hidden',
                    }}
                  >
                    {player.avatar_url ? (
                      <img
                        src={player.avatar_url}
                        alt={player.nickname}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      player.nickname.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)' }}>
                        {player.nickname}
                      </span>
                      {isMe && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--accent)', fontWeight: 800 }}>
                          (You)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      Joined {new Date(player.joined_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                {player.is_host && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#D97706',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                    }}
                  >
                    <Crown size={14} />
                    <span>HOST</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty Seats Placeholders */}
          {Array.from({ length: emptySeats }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 18px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--line)',
                color: 'var(--text-muted)',
                fontSize: '0.86rem',
                gap: '14px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '1px dashed var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.82rem',
                }}
              >
                {playerCount + i + 1}
              </div>
              <span>Open Seat &mdash; waiting for legislator to take position...</span>
            </div>
          ))}
        </div>

        {/* Host Control / Non-host Message */}
        <div style={{ marginTop: '12px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
          {isHost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={handleStartGame}
                disabled={!canStart || isStarting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '15px 22px',
                  background: canStart ? 'var(--accent)' : 'var(--surface-2)',
                  color: canStart ? 'var(--accent-contrast)' : 'var(--text-muted)',
                  border: canStart ? 'none' : '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  cursor: canStart && !isStarting ? 'pointer' : 'not-allowed',
                  opacity: canStart && !isStarting ? 1 : 0.6,
                  transition: 'all 0.15s ease',
                  boxShadow: canStart ? 'var(--panel-shadow)' : 'none',
                }}
              >
                <Play size={20} />
                <span>
                  {isStarting
                    ? 'Commencing Match...'
                    : canStart
                    ? 'Start Game'
                    : 'Waiting for at least 2 players...'}
                </span>
              </button>
              {!canStart && (
                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Share the chamber code or invitation link with at least one colleague to begin.
                </p>
              )}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '16px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.92rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Sparkles size={18} style={{ color: 'var(--accent)' }} />
              <span>Waiting for host to start...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
