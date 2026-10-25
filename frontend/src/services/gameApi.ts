const getNormalizedApiBaseUrl = (): string => {
  let url = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (!url) {
    return import.meta.env.PROD ? '' : 'http://localhost:8000';
  }
  // Auto-prepend https:// if protocol was omitted
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  // Prevent Mixed Content error when frontend is on https and url is http (non-localhost)
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://') && !url.includes('localhost')) {
    url = url.replace('http://', 'https://');
  }
  // Strip trailing slashes to prevent double slashes like //game/new
  return url.replace(/\/+$/, '');
};

const API_BASE_URL = getNormalizedApiBaseUrl();

export interface BackendPlayerInput {
  id: string;
  name: string;
}

export interface BackendGameSettings {
  board_size: 6 | 8 | 10;
  dice_type: '1d6' | '2d6' | '1d12';
  win_target: number;
  mode: 'draft' | 'live' | 'hybrid';
  max_rules: 8 | 12 | 16;
  amend_every?: 1 | 2;
}

export interface BackendGameState {
  game_id: string;
  phase: 'drafting' | 'playing' | 'finished';
  settings: BackendGameSettings;
  players: {
    id: string;
    name: string;
    position: number;
    score: number;
    skip_next: boolean;
  }[];
  current_player: number;
  turn: number;
  last_roll: number | null;
  moves_since_amend: number;
  rules: Record<string, unknown>[];
  log: Record<string, unknown>[];
  leaderboard: Record<string, unknown>[];
  winner: string | null;
  rulebook_info: Record<string, unknown> | null;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const body = await response.json();
      message = typeof body.detail === 'string'
        ? body.detail
        : JSON.stringify(body.detail ?? body);
    } catch {
      // Keep the fallback message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function createBackendGame(
  settings: BackendGameSettings,
  players: BackendPlayerInput[],
) {
  return request<{ game_id: string; state: BackendGameState }>(
    '/game/new',
    {
      method: 'POST',
      body: JSON.stringify({ settings, players }),
    },
  );
}

export async function fetchBackendGame(gameId: string) {
  return request<{ state: BackendGameState }>(
    `/game/${encodeURIComponent(gameId)}`,
  );
}

export async function rollBackendTurn(
  gameId: string,
  playerId: string,
) {
  return request<{ state: BackendGameState; roll: number }>(
    `/game/${encodeURIComponent(gameId)}/roll`,
    {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId }),
    },
  );
}

export async function submitBackendAmendment(
  gameId: string,
  playerId: string,
  text: string,
) {
  return request<{
    accepted: boolean;
    category?: 'not_a_game_rule' | 'invalid_rule' | 'accepted' | 'court_error' | null;
    rule: Record<string, unknown> | null;
    error: string | null;
    state: BackendGameState;
  }>(
    `/game/${encodeURIComponent(gameId)}/amend`,
    {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, text }),
    },
  );
}

export async function passBackendAmendment(
  gameId: string,
  playerId: string,
) {
  return request<{
    accepted: boolean;
    error: string | null;
    state: BackendGameState;
  }>(
    `/game/${encodeURIComponent(gameId)}/pass-amendment`,
    {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId }),
    },
  );
}

export interface RulesBookItem {
  id: string;
  game_id: string;
  original_text: string;
  description: string;
  compiled_rule: Record<string, unknown>;
  proposer_id: string;
  proposer_name: string;
  created_at: string;
  status: 'active' | 'inactive' | 'rejected' | 'expired';
  order: number;
}

export async function fetchRulesBook(gameId: string) {
  return request<{ game_id: string; mode: string; rules: RulesBookItem[] }>(
    `/game/${encodeURIComponent(gameId)}/rules-book`,
  );
}

export interface CourtCompileResult {
  accepted: boolean;
  category?: 'accepted' | 'not_a_game_rule' | 'invalid_rule' | 'court_error' | null;
  rule: Record<string, unknown> | null;
  error: string | null;
}

export interface CourtHealth {
  provider: string;
  model: string;
  ollama_reachable: boolean;
  model_installed: boolean;
  message: string;
}

export async function submitBackendCompile(
  text: string,
  settings?: {
    board_size?: number;
    dice_type?: string;
    win_target?: number;
    max_rules?: number;
    mode?: string;
  },
  acceptedRules?: Array<Record<string, unknown>>,
): Promise<CourtCompileResult> {
  return request<CourtCompileResult>('/court/compile', {
    method: 'POST',
    body: JSON.stringify({
      text,
      settings: settings
        ? {
            board_size: settings.board_size ?? 6,
            dice_type: settings.dice_type ?? '1d6',
            win_target: settings.win_target ?? 21,
            max_rules: settings.max_rules ?? 8,
            mode: settings.mode ?? 'draft',
          }
        : undefined,
      accepted_rules: acceptedRules ?? [],
    }),
  });
}

export async function fetchCourtHealth(): Promise<CourtHealth> {
  return request<CourtHealth>('/court/health');
}

