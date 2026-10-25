import React, { useState, useEffect } from 'react';
import {
  AuthUser,
  loginAsGuest,
  loginWithGoogle,
  getStoredUser,
  logout
} from '../services/authService';
import {
  Shield,
  Sparkles,
  Dice5,
  ArrowRight,
  LogOut,
  UserCheck,
  AlertCircle
} from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
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

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthenticated,
  onBypassToLocalPlay,
}) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

  useEffect(() => {
    const user = getStoredUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  // Google Identity Services setup
  useEffect(() => {
    if (!googleClientId) return;

    const scriptId = 'google-gsi-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const initializeGsi = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: any) => {
            if (response.credential) {
              try {
                setLoading(true);
                setError(null);
                const user = await loginWithGoogle(response.credential);
                setCurrentUser(user);
                onAuthenticated(user);
              } catch (err: any) {
                setError(err.message || 'Google sign-in failed');
              } finally {
                setLoading(false);
              }
            }
          },
        });

        const btnContainer = document.getElementById('google-btn-container');
        if (btnContainer) {
          google.accounts.id.renderButton(btnContainer, {
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
  }, [googleClientId, onAuthenticated]);

  const handleRollNickname = () => {
    const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
    const noun = RANDOM_NOUNS[Math.floor(Math.random() * RANDOM_NOUNS.length)];
    const num = Math.floor(10 + Math.random() * 90);
    setNickname(`${adj}${noun}${num}`);
  };

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await loginAsGuest(nickname || undefined);
      setCurrentUser(user);
      onAuthenticated(user);
    } catch (err: any) {
      setError(err.message || 'Could not authenticate as guest');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--panel-shadow)',
          padding: '36px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative Top Accent Bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          }}
        />

        {/* Header Branding */}
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
              fontSize: '1.75rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--text)',
              marginBottom: '6px',
            }}
          >
            AMENDMENT
          </h1>
          <p
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}
          >
            Multiplayer Chamber &middot; Rewrite the rules in real-time
          </p>
        </div>

        {error && (
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
            <span>{error}</span>
          </div>
        )}

        {/* Existing Session Detected */}
        {currentUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  overflow: 'hidden',
                }}
              >
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.nickname}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <UserCheck size={20} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Authenticated As ({currentUser.type})
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentUser.nickname}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onAuthenticated(currentUser)}
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
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              <span>Enter Lobby Chamber</span>
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 16px',
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <LogOut size={16} />
              <span>Switch Identity / Sign Out</span>
            </button>
          </div>
        ) : (
          /* Authentication Form */
          <form onSubmit={handleGuestLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label
                  htmlFor="nickname-input"
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  Legislative Call-sign (Nickname)
                </label>
                <button
                  type="button"
                  onClick={handleRollNickname}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 6px',
                  }}
                >
                  <Dice5 size={14} />
                  <span>Randomize</span>
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  id="nickname-input"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. SwiftFox42 (optional)"
                  maxLength={20}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontSize: '0.92rem',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                Leave blank to auto-generate a distinguished title.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
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
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: 'var(--panel-shadow)',
              }}
            >
              <Sparkles size={18} />
              <span>{loading ? 'Entering Chamber...' : 'Play as Guest'}</span>
            </button>

            {/* Google OAuth Section */}
            <div style={{ marginTop: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  margin: '12px 0',
                }}
              >
                <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Or
                </span>
                <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
              </div>

              {googleClientId ? (
                <div id="google-btn-container" style={{ display: 'flex', justifyContent: 'center' }} />
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: '1px dashed var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Guest-only development mode active
                </div>
              )}
            </div>

            {/* Direct Local Match bypass for teammates */}
            {onBypassToLocalPlay && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
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
                  Switch to Single-Device Local Match
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
