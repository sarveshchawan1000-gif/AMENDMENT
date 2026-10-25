/**
 * Auth Service for AMENDMENT
 * Provides typed auth operations, adapter interfaces (AuthUser),
 * and re-exports core API client functions and session state.
 */

import {
  guestLogin,
  googleLogin,
  UserProfile,
} from '../api/client';
import {
  setSession,
  clearSession,
  getStoredUser as getStoredSessionUser,
  getStoredToken,
} from '../store/session';

export * from '../api/client';
export * from '../store/session';

export interface AuthUser {
  playerId: string;
  nickname: string;
  type: 'guest' | 'google';
  avatarUrl?: string | null;
  token?: string;
}

export const loginAsGuest = async (nickname?: string): Promise<AuthUser> => {
  const res = await guestLogin(nickname);
  const profile: UserProfile = {
    player_id: res.player_id,
    nickname: res.nickname,
    type: res.type,
    avatar_url: res.avatar_url,
  };
  setSession(res.token, profile);
  return {
    playerId: res.player_id,
    nickname: res.nickname,
    type: res.type,
    avatarUrl: res.avatar_url,
    token: res.token,
  };
};

export const loginWithGoogle = async (idToken: string): Promise<AuthUser> => {
  const res = await googleLogin(idToken);
  const profile: UserProfile = {
    player_id: res.player_id,
    nickname: res.nickname,
    type: res.type,
    avatar_url: res.avatar_url,
  };
  setSession(res.token, profile);
  return {
    playerId: res.player_id,
    nickname: res.nickname,
    type: res.type,
    avatarUrl: res.avatar_url,
    token: res.token,
  };
};

export const getStoredUser = (): AuthUser | null => {
  const user = getStoredSessionUser();
  if (!user) return null;
  return {
    playerId: user.player_id,
    nickname: user.nickname,
    type: user.type,
    avatarUrl: user.avatar_url,
    token: getStoredToken() ?? undefined,
  };
};

export const logout = async (): Promise<void> => {
  clearSession();
};
