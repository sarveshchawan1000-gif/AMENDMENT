/**
 * Session Store for AMENDMENT
 * Manages user authentication state, token persistence, and auto-restoration via GET /auth/me.
 */

import { useState, useEffect } from 'react';
import { UserProfile, getMe, setAuthTokenGetter } from '../api/client';

const TOKEN_STORAGE_KEY = 'amendment_token';
const USER_STORAGE_KEY = 'amendment_user_profile';

export interface SessionState {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
}

// Global in-memory state
let currentToken: string | null = (typeof window !== 'undefined')
  ? localStorage.getItem(TOKEN_STORAGE_KEY)
  : null;

let currentUser: UserProfile | null = (() => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
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

export function setSession(token: string, user: UserProfile): void {
  currentToken = token;
  currentUser = user;
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
  notifyListeners(false);
}

export function clearSession(): void {
  currentToken = null;
  currentUser = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }
  notifyListeners(false);
}

export async function restoreSession(): Promise<UserProfile | null> {
  const token = (typeof window !== 'undefined')
    ? localStorage.getItem(TOKEN_STORAGE_KEY)
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
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
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
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
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
  };
}
