/**
 * AuthScreen for AMENDMENT
 * Provides Google Sign-In, Guest Sign-In with nickname generator,
 * Room Creation, Room Joining with 6-char code validation, and deep-link support (/join/CODE or ?room=CODE).
 */

import React, { useState, useEffect } from 'react';
import {
  guestLogin,
  googleLogin,
  createRoom,
  joinRoom,
  RoomState,
  ApiError
} from '../api/client';
import { useSession } from '../store/session';
import {
  Shield,
  Sparkles,
  Dice5,
  ArrowRight,
  LogOut,
  UserCheck,
  AlertCircle,
  PlusCircle,
  LogIn,
  Info,
  Users
} from 'lucide-react';

interface AuthScreenProps {
  onRoomJoined: (room: RoomState) => void;
  onBypassToLocalPlay?: () => void;
}

const RANDOM_ADJECTIVES = [
  'Swift', 'Clever', 'Brave', 'Silent', 'Noble', 'Cunning', 'Fierce',
  'Bold', 'Keen', 'Mighty', 'Quick', 'Vigilant', 'Wise', 'Witty', 'Astute'
];
const RANDOM_NOUNS = [
  'Fox', 'Falcon', 'Owl', 'Wolf', 'Badger', 'Otter', 'Lynx',
  'Raven', 'Hawk', 'Panther', 'Tiger', 'Bear', 'Eagle', 'Stag', 'Advocate'
];

/** Convert raw fetch / ApiError to a human-readable string. */
function humanizeError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Browser network errors
    if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('network')) {
      return 'Cannot reach the server — make sure the backend is running (uvicorn app:app --reload).';
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION_REFUSED')) {
      return 'Connection refused — the backend server is not running on the expected port.';
    }
    return msg || fallback;
  }
  return fallback;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onRoomJoined,
  onBypassToLocalPlay,
}) => {
  const { user, login, logout, isLoading: isSessionLoading, createTabGuestSession } = useSession();

  // Auth form state
  const [nickname, setNickname] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  // Room action state
  const [roomCode, setRoomCode] = useState<string>('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState<boolean>(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState<boolean>(false);
  const [isCreatingTabPlayer, setIsCreatingTabPlayer] = useState<boolean>(false);
  const [selfJoinDetected, setSelfJoinDetected] = useState<{
    roomCode: string;
    hostNickname: string;
    room: RoomState;
  } | null>(null);

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

  // Deep-link detection (/join/AMND82 or ?room=AMND82)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let candidateCode = '';
    const params = new URLSearchParams(window.location.search);
    const queryRoom = params.get('room');

    if (queryRoom) {
      candidateCode = queryRoom.trim().toUpperCase();
    } else if (window.location.pathname.startsWith('/join/')) {
      candidateCode = window.location.pathname.replace('/join/', '').trim().toUpperCase();
    }

    if (candidateCode && /^[A-Z0-9]{1,6}$/.test(candidateCode)) {
      setRoomCode(candidateCode);
    }
  }, []);

  // Google Identity Services integration
  useEffect(() => {
    if (!googleClientId || typeof window === 'undefined') return;

    const scriptId = 'google-gsi-client-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initializeGsi = () => {
      interface GoogleAccounts {
        id: {
          initialize: (config: { client_id: string; callback: (res: { credential?: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
        };
      }
      interface WindowWithGoogle extends Window {
        google?: { accounts: GoogleAccounts };
      }

      const win = window as WindowWithGoogle;
      if (win.google?.accounts?.id) {
        win.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (response.credential) {
              try {
                setIsSubmittingAuth(true);
                setAuthError(null);
                const res = await googleLogin(response.credential);
                login(res.token, {
                  player_id: res.player_id,
                  nickname: res.nickname,
                  type: res.type,
                  avatar_url: res.avatar_url,
                });
              } catch (err: unknown) {
                setAuthError(humanizeError(err, 'Google authentication failed'));
              } finally {
                setIsSubmittingAuth(false);
              }
            }
          },
        });

        const btnContainer = document.getElementById('google-signin-btn-mount');
        if (btnContainer) {
          win.google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
          });
        }
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGsi;
      document.body.appendChild(script);
    } else {
      initializeGsi();
    }
  }, [googleClientId, login]);

  const handleShuffleNickname = () => {
    const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
    const noun = RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)];
    const num = Math.floor(10 + Math.random() * 90);
    setNickname(`${adj}${noun}${num}`);
    setAuthError(null);
  };

  const handleGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError(null);

    try {
      const res = await guestLogin(nickname || undefined);
      login(res.token, {
        player_id: res.player_id,
        nickname: res.nickname,
        type: res.type,
        avatar_url: res.avatar_url,
      });
    } catch (err: unknown) {
      setAuthError(humanizeError(err, 'Guest sign-in failed'));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    setRoomError(null);

    try {
      const room = await createRoom();
      onRoomJoined(room);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setRoomError(err.message);
      } else {
        setRoomError('Unable to create room. Please try again.');
      }
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleNewTabIdentity = async () => {
    setIsCreatingTabPlayer(true);
    setRoomError(null);
    setSelfJoinDetected(null);
    try {
      await createTabGuestSession();
    } catch (err: unknown) {
      setRoomError(humanizeError(err, 'Failed to create new tab guest.'));
    } finally {
      setIsCreatingTabPlayer(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmedCode = roomCode.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      setRoomError('Chamber code must be exactly 6 characters.');
      return;
    }

    setIsJoiningRoom(true);
    setRoomError(null);
    setSelfJoinDetected(null);

    try {
      const room = await joinRoom(trimmedCode, user.player_id);

      // Detect if caller is the host and only player in the room (i.e. testing on same machine from second tab)
      if (room.host_id === user.player_id && room.players.length === 1) {
        setSelfJoinDetected({
          roomCode: trimmedCode,
          hostNickname: user.nickname,
          room,
        });
        setIsJoiningRoom(false);
        return;
      }

      onRoomJoined(room);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ROOM_NOT_FOUND') {
          setRoomError(`Chamber "${trimmedCode}" does not exist. (If the backend was restarted, previous chambers were reset)`);
        } else if (err.code === 'ROOM_FULL') {
          setRoomError(`Chamber "${trimmedCode}" is already full (maximum capacity reached).`);
        } else if (err.code === 'GAME_ALREADY_STARTED') {
          setRoomError(`Chamber "${trimmedCode}" has already commenced its match.`);
        } else {
          setRoomError(err.message);
        }
      } else {
        setRoomError('Failed to join chamber. Please verify your connection.');
      }
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handleJoinAsSecondPlayer = async () => {
    if (!selfJoinDetected) return;
    setIsJoiningRoom(true);
    setRoomError(null);
    try {
      const newProfile = await createTabGuestSession();
      const joinedRoom = await joinRoom(selfJoinDetected.roomCode, newProfile.player_id);
      setSelfJoinDetected(null);
      onRoomJoined(joinedRoom);
    } catch (err: unknown) {
      setRoomError(humanizeError(err, 'Failed to join chamber as second player.'));
    } finally {
      setIsJoiningRoom(false);
    }
  };

  const handleContinueAsHost = () => {
    if (!selfJoinDetected) return;
    onRoomJoined(selfJoinDetected.room);
  };

  const isNicknameValid = nickname.length <= 20;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        padding: '24px 16px',
        width: '100%',
        maxWidth: '540px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--panel-shadow)',
          padding: '36px 30px',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Accent Top Stripe */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, var(--accent), var(--accent-2, #38BDF8))',
          }}
        />

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              color: 'var(--accent)',
              marginBottom: '16px',
            }}
          >
            <Shield size={28} />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.85rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text)',
              marginBottom: '6px',
            }}
          >
            AMENDMENT
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            The Living Constitutional Board Game
          </p>
        </div>

        {/* Session restore loading overlay */}
        {isSessionLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              padding: '40px 0',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '3px solid var(--line)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span style={{ fontSize: '0.85rem' }}>Restoring your session…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* STAGE 1: NOT AUTHENTICATED */}
        {!isSessionLoading && !user && (
          <div>
            {authError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{authError}</span>
              </div>
            )}

            {/* Google OAuth Section */}
            <div style={{ marginBottom: '22px' }}>
              {googleClientId ? (
                <div
                  id="google-signin-btn-mount"
                  style={{ display: 'flex', justifyContent: 'center', minHeight: '44px' }}
                />
              ) : (
                <div
                  title="Google OAuth is disabled because VITE_GOOGLE_CLIENT_ID is unset in .env"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '11px 16px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--line)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                    fontSize: '0.82rem',
                    cursor: 'not-allowed',
                    userSelect: 'none',
                  }}
                >
                  <Info size={16} />
                  <span>Google Sign-In (Unconfigured &middot; Guest Mode Active)</span>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '18px 0',
              }}
            >
              <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Or Continue As Guest
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
            </div>

            {/* Guest Sign-In Form */}
            <form onSubmit={handleGuestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label
                    htmlFor="guest-nickname-input"
                    style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}
                  >
                    Legislative Call-sign
                  </label>
                  <button
                    type="button"
                    onClick={handleShuffleNickname}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                  >
                    <Dice5 size={14} />
                    <span>Shuffle name</span>
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    id="guest-nickname-input"
                    type="text"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="e.g. SwiftFox42 (optional)"
                    maxLength={20}
                    disabled={isSubmittingAuth}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${isNicknameValid ? 'var(--line)' : 'var(--danger)'}`,
                      background: 'var(--surface-2)',
                      color: 'var(--text)',
                      fontSize: '0.94rem',
                      outline: 'none',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Leave blank to auto-generate title.
                  </span>
                  <span style={{ fontSize: '0.74rem', color: nickname.length > 20 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {nickname.length}/20
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth || !isNicknameValid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '13px 18px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.96rem',
                  cursor: isSubmittingAuth || !isNicknameValid ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingAuth || !isNicknameValid ? 0.65 : 1,
                  boxShadow: 'var(--panel-shadow)',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <Sparkles size={18} />
                <span>{isSubmittingAuth ? 'Entering Chamber...' : 'Continue as Guest'}</span>
              </button>
            </form>
          </div>
        )}

        {/* STAGE 2: AUTHENTICATED -> CHOOSE ACTION (CREATE OR JOIN ROOM) */}
        {!isSessionLoading && user && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Authenticated Identity Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '1rem',
                    overflow: 'hidden',
                  }}
                >
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.nickname}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <UserCheck size={18} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: 'var(--text)' }}>
                    {user.nickname}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {user.type === 'google' ? 'Google Account' : 'Guest Identity'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => logout()}
                title="Sign out or switch identity"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 10px',
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={14} />
                <span>Switch</span>
              </button>
            </div>

            {/* Same-machine multi-tab testing helper */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
              }}
            >
              <span>Testing 2 tabs on this computer?</span>
              <button
                type="button"
                onClick={handleNewTabIdentity}
                disabled={isCreatingTabPlayer}
                title="Generates an independent player identity for this tab only, keeping other tabs intact"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: isCreatingTabPlayer ? 'wait' : 'pointer',
                }}
              >
                <Users size={12} />
                <span>{isCreatingTabPlayer ? 'Generating...' : '+ New Tab Player'}</span>
              </button>
            </div>

            {roomError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--danger)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: '0.86rem',
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                <span>{roomError}</span>
              </div>
            )}

            {/* Self-join / Same machine host warning & resolution */}
            {selfJoinDetected && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid #eab308',
                  color: 'var(--text)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#eab308' }}>
                  <AlertCircle size={18} />
                  <span>Host Session Detected on Same Machine</span>
                </div>
                <p style={{ fontSize: '0.84rem', margin: 0, lineHeight: 1.45, color: 'var(--text-muted)' }}>
                  You are currently logged in as <strong>{selfJoinDetected.hostNickname}</strong> (the Chamber Host).
                  To join Chamber <strong>{selfJoinDetected.roomCode}</strong> as a <em>second player</em> on this computer:
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={handleJoinAsSecondPlayer}
                    disabled={isJoiningRoom}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      background: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >
                    ⚡ Join as Player 2 (Local Tab)
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueAsHost}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                    }}
                  >
                    Enter as Host
                  </button>
                </div>
              </div>
            )}

            {/* Action 1: Create Room */}
            <div
              style={{
                padding: '18px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                  Create New Chamber
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Host a room, receive a unique 6-character code, and lead the constitutional debate.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreatingRoom || isJoiningRoom}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.94rem',
                  cursor: isCreatingRoom ? 'not-allowed' : 'pointer',
                  opacity: isCreatingRoom ? 0.7 : 1,
                  boxShadow: 'var(--panel-shadow)',
                }}
              >
                <PlusCircle size={18} />
                <span>{isCreatingRoom ? 'Establishing Chamber...' : 'Create Room'}</span>
              </button>
            </div>

            {/* Action 2: Join Room */}
            <form
              onSubmit={handleJoinRoom}
              style={{
                padding: '18px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                  Join Chamber by Code
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Enter the 6-character chamber code to take your seat.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="room-code-input"
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
                    setRoomCode(cleaned);
                    if (roomError) setRoomError(null);
                  }}
                  placeholder="AMND82"
                  maxLength={6}
                  disabled={isJoiningRoom || isCreatingRoom}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                    letterSpacing: '0.12em',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />

                <button
                  type="submit"
                  disabled={isJoiningRoom || isCreatingRoom || roomCode.trim().length !== 6}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px 18px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: roomCode.trim().length === 6 && !isJoiningRoom ? 'pointer' : 'not-allowed',
                    opacity: roomCode.trim().length === 6 && !isJoiningRoom ? 1 : 0.6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <LogIn size={16} />
                  <span>{isJoiningRoom ? 'Joining...' : 'Join'}</span>
                </button>
              </div>
            </form>

            {/* Offline Match Bypass */}
            {onBypassToLocalPlay && (
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={onBypassToLocalPlay}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Or launch single-device local match
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
