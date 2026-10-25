/**
 * AMENDMENT API Client
 * Typed fetch wrapper for authentication and room management.
 */

export class ApiError extends Error {
  public status: number;
  public code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface UserProfile {
  player_id: string;
  nickname: string;
  type: 'guest' | 'google';
  avatar_url?: string;
}

export interface AuthResult {
  player_id: string;
  nickname: string;
  type: 'guest' | 'google';
  avatar_url?: string;
  token: string;
}

export interface RoomPlayer {
  player_id: string;
  nickname: string;
  avatar_url?: string;
  joined_at: number;
  is_host: boolean;
}

export interface RoomState {
  room_code: string;
  host_id: string;
  status: 'lobby' | 'started';
  players: RoomPlayer[];
  max_players?: number;
  can_start?: boolean;
}

const getApiBaseUrl = (): string => {
  let url = (
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_API_BASE_URL ??
    ''
  ).trim();

  if (!url) {
    return import.meta.env.PROD ? '' : 'http://localhost:8000';
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('http://') &&
    !url.includes('localhost')
  ) {
    url = url.replace('http://', 'https://');
  }
  return url.replace(/\/+$/, '');
};

const BASE_URL = getApiBaseUrl();

let authTokenGetter: (() => string | null) | null = null;

export const setAuthTokenGetter = (getter: () => string | null): void => {
  authTokenGetter = getter;
};

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = authTokenGetter ? authTokenGetter() : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const data = await response.json();
      if (typeof data.detail === 'object' && data.detail !== null) {
        errorMessage = data.detail.detail || errorMessage;
        errorCode = data.detail.code || errorCode;
      } else if (typeof data.detail === 'string') {
        errorMessage = data.detail;
      }
    } catch {
      // Use fallback error message
    }

    throw new ApiError(response.status, errorCode, errorMessage);
  }

  return response.json() as Promise<T>;
}

export async function guestLogin(nickname?: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({
      nickname: nickname && nickname.trim() ? nickname.trim() : undefined,
    }),
  });
}

export async function googleLogin(idToken: string): Promise<AuthResult> {
  return apiRequest<AuthResult>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function getMe(): Promise<UserProfile> {
  return apiRequest<UserProfile>('/auth/me', {
    method: 'GET',
  });
}

export async function createRoom(): Promise<RoomState> {
  return apiRequest<RoomState>('/rooms/create', {
    method: 'POST',
  });
}

export async function joinRoom(
  roomCode: string,
  playerId: string
): Promise<RoomState> {
  return apiRequest<RoomState>('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({
      room_code: roomCode.trim().toUpperCase(),
      player_id: playerId,
    }),
  });
}

export async function getRoom(roomCode: string): Promise<RoomState> {
  return apiRequest<RoomState>(`/rooms/${encodeURIComponent(roomCode.trim().toUpperCase())}`, {
    method: 'GET',
  });
}

export async function leaveRoom(
  roomCode: string
): Promise<{ room_deleted: boolean }> {
  return apiRequest<{ room_deleted: boolean }>(
    `/rooms/${encodeURIComponent(roomCode.trim().toUpperCase())}/leave`,
    {
      method: 'POST',
    }
  );
}

export async function startRoom(
  roomCode: string
): Promise<{ room_code: string; status: string }> {
  return apiRequest<{ room_code: string; status: string }>(
    `/rooms/${encodeURIComponent(roomCode.trim().toUpperCase())}/start`,
    {
      method: 'POST',
    }
  );
}
