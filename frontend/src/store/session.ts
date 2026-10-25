/**
 * Session Store for AMENDMENT
 * Manages user authentication state, token persistence, and auto-restoration via GET /auth/me.
 * Supports per-tab session isolation via sessionStorage for seamless same-machine multiplayer testing.
 */

import { useState, useEffect } from 'react';
import { UserProfile, getMe, setAuthTokenGetter, guestLogin } from '../api/client';

const TOKEN_STORAGE_KEY = 'amendment_token';
const USER_STORAGE_KEY = 'amendment_user_profile';
const SESSION_TOKEN_KEY = 'amendment_tab_token';
const SESSION_USER_KEY = 'amendment_tab_user';

export interface SessionState {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
}

// Global in-memory state
// Read tab-isolated sessionStorage first, then fallback to shared localStorage
let currentToken: string | null = (() => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
})();

let currentUser: UserProfile | null = (() => {
  if (typeof window === 'undefined') return null;
  const tabRaw = sessionStorage.getItem(SESSION_USER_KEY);
  if (tabRaw) {
    try {
      return JSON.parse(tabRaw) as UserProfile;
    } catch {}
  }
  const localRaw = localStorage.getItem(USER_STORAGE_KEY);
  if (!localRaw) return null;
  try {
    return JSON.parse(localRaw) as UserProfile;
  } catch {
    return null;
  }
})();

// Wire token getter to API client
setAuthTokenGetter(() => currentToken);

type SessionListener = (state: SessionState) => void;
const listeners = new Set<SessionListener>();

function notifyListeners(isLoading: boolean = false): void {
  const state: SessionState = {
    user: currentUser,
    token: currentToken,
    isLoading,
  };
  listeners.forEach((listener) => listener(state));
}

export function getStoredToken(): string | null {
  return currentToken;
}

export function getStoredUser(): UserProfile | null {
  return currentUser;
}

/**
 * Set session state.
 * @param token JWT token
 * @param user User profile
 * @param persistLocal If true (default), persists to localStorage so it survives browser restart.
 *                     If false, stores only in sessionStorage for tab-isolated multi-player testing.
 */
export function setSession(token: string, user: UserProfile, persistLocal: boolean = true): void {
  currentToken = token;
  currentUser = user;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    if (persistLocal) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    }
  }
  notifyListeners(false);
}

/**
 * Clear session.
 * @param clearLocal If true (default), clears both sessionStorage and localStorage.
 *                   If false, clears only this tab's sessionStorage.
 */
export function clearSession(clearLocal: boolean = true): void {
  currentToken = null;
  currentUser = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    if (clearLocal) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }
  notifyListeners(false);
}

/**
 * Creates an isolated guest session strictly for the current tab.
 * Does not overwrite localStorage, allowing multiple browser tabs on the same computer
 * to test distinct players simultaneously.
 */
export async function createTabGuestSession(nickname?: string): Promise<UserProfile> {
  const res = await guestLogin(nickname);
  const profile: UserProfile = {
    player_id: res.player_id,
    nickname: res.nickname,
    type: res.type,
    avatar_url: res.avatar_url,
  };
  setSession(res.token, profile, false);
  return profile;
}

export async function restoreSession(): Promise<UserProfile | null> {
  const token = (typeof window !== 'undefined')
    ? (sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY))
    : null;

  if (!token) {
    clearSession();
    return null;
  }

  currentToken = token;
  notifyListeners(true);

  try {
    const user = await getMe();
    currentUser = user;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      // Only update localStorage if token is in localStorage
      if (localStorage.getItem(TOKEN_STORAGE_KEY) === token) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      }
    }
    notifyListeners(false);
    return user;
  } catch {
    clearSession();
    return null;
  }
}

/**
 * React hook to access and subscribe to session state.
 */
export function useSession(): SessionState & {
  login: (token: string, user: UserProfile, persistLocal?: boolean) => void;
  logout: (clearLocal?: boolean) => void;
  createTabGuestSession: (nickname?: string) => Promise<UserProfile>;
} {
  const [state, setState] = useState<SessionState>({
    user: currentUser,
    token: currentToken,
    isLoading: !!currentToken && !currentUser,
  });

  useEffect(() => {
    const listener: SessionListener = (newState) => {
      setState(newState);
    };
    listeners.add(listener);

    // Initial restoration if token exists but user is not loaded
    if (currentToken && !currentUser) {
      void restoreSession();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    ...state,
    login: setSession,
    logout: clearSession,
    createTabGuestSession,
  };
}
