/**
 * AMENDMENT Room & Lobby Service
 * Typed client functions matching backend/rooms.py endpoints
 * and WebSocket helper for live lobby updates.
 */

import {
  RoomState,
  RoomPlayer,
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  getRoom as apiGetRoom,
  leaveRoom as apiLeaveRoom,
  startRoom as apiStartRoom,
  ApiError,
} from '../api/client';
import { getStoredToken } from '../store/session';

export type { RoomState, RoomPlayer };
export { ApiError };

export interface LobbyUpdateEventPayload {
  type: 'lobby_update';
  room_code: string;
  host_id: string;
  status: 'lobby' | 'started';
  players: RoomPlayer[];
  can_start: boolean;
}

export interface GameStartedEventPayload {
  type: 'game_started';
  room_code: string;
  host_id: string;
  players: RoomPlayer[];
}

export interface PongEventPayload {
  type: 'pong';
  timestamp: number;
}

export type LobbyServerEvent =
  | LobbyUpdateEventPayload
  | GameStartedEventPayload
  | PongEventPayload;

export interface LobbyWebSocketCallbacks {
  onLobbyUpdate?: (state: RoomState) => void;
  onGameStarted?: (roomCode: string, players: RoomPlayer[]) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onPong?: (timestamp: number) => void;
}

export interface LobbyWebSocketSubscription {
  socket: WebSocket;
  sendPing: () => void;
  close: () => void;
}

/**
 * Creates a new game room with the authenticated user as host.
 */
export async function createRoom(): Promise<RoomState> {
  return apiCreateRoom();
}

/**
 * Joins an existing room with room code and player ID.
 */
export async function joinRoom(
  roomCode: string,
  playerId: string
): Promise<RoomState> {
  return apiJoinRoom(roomCode, playerId);
}

/**
 * Fetches the current state of a room.
 */
export async function getRoom(roomCode: string): Promise<RoomState> {
  return apiGetRoom(roomCode);
}

/**
 * Leaves a room. If host leaves, host migrates; if empty, room is deleted.
 */
export async function leaveRoom(
  roomCode: string
): Promise<{ room_deleted: boolean }> {
  return apiLeaveRoom(roomCode);
}

/**
 * Starts the game. Must be host and have at least 2 players.
 */
export async function startRoom(
  roomCode: string
): Promise<{ room_code: string; status: string }> {
  return apiStartRoom(roomCode);
}

/**
 * Resolves the WebSocket URL for a given room code and token.
 */
export function getLobbyWebSocketUrl(
  roomCode: string,
  token?: string | null
): string {
  const effectiveToken = token ?? getStoredToken() ?? '';
  let wsBase = (
    import.meta.env.VITE_API_URL ??
    import.meta.env.VITE_API_BASE_URL ??
    ''
  ).trim();

  if (!wsBase) {
    const protocol =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? 'wss:'
        : 'ws:';
    const host =
      typeof window !== 'undefined' && window.location.host
        ? window.location.host
        : 'localhost:8000';
    wsBase = `${protocol}//${host}`;
  } else if (wsBase.startsWith('https://')) {
    wsBase = wsBase.replace('https://', 'wss://');
  } else if (wsBase.startsWith('http://')) {
    wsBase = wsBase.replace('http://', 'ws://');
  }

  const cleanCode = encodeURIComponent(roomCode.trim().toUpperCase());
  const tokenQuery = effectiveToken
    ? `?token=${encodeURIComponent(effectiveToken)}`
    : '';
  return `${wsBase}/rooms/${cleanCode}/ws${tokenQuery}`;
}

/**
 * Establishes a WebSocket connection for real-time lobby updates,
 * handling automatic ping heartbeat (every 15s) and typed callbacks.
 */
export function subscribeToLobbyUpdates(
  roomCode: string,
  callbacks: LobbyWebSocketCallbacks,
  token?: string | null
): LobbyWebSocketSubscription {
  const url = getLobbyWebSocketUrl(roomCode, token);
  const ws = new WebSocket(url);
  let heartbeatTimer: any = null;

  const cleanupHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const sendPing = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  };

  ws.onopen = () => {
    heartbeatTimer = setInterval(sendPing, 15000);
    callbacks.onOpen?.();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as LobbyServerEvent;
      if (data.type === 'lobby_update') {
        const roomState: RoomState = {
          room_code: data.room_code,
          host_id: data.host_id,
          status: data.status,
          players: data.players,
          can_start: data.can_start,
        };
        callbacks.onLobbyUpdate?.(roomState);
      } else if (data.type === 'game_started') {
        callbacks.onGameStarted?.(data.room_code, data.players);
      } else if (data.type === 'pong') {
        callbacks.onPong?.(data.timestamp);
      }
    } catch {
      // Ignore unparseable frames
    }
  };

  ws.onerror = (error: Event) => {
    callbacks.onError?.(error);
  };

  ws.onclose = (event: CloseEvent) => {
    cleanupHeartbeat();
    callbacks.onClose?.(event);
  };

  const close = () => {
    cleanupHeartbeat();
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  };

  return {
    socket: ws,
    sendPing,
    close,
  };
}
