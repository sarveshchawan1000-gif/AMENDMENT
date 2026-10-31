# AMENDMENT: Auth, Rooms & Lobby Documentation

This document covers everything before the dice rolls: Guest & Google Authentication, Room Code generation, Lobby state synchronization, WebSocket communication, and integration points for teammates working on the gameplay engine and screens.

---

## 1. Environment Variables

Configure these in `backend/.env` (based on [backend/.env.example](file:///Users/sarveshchavan/AMENDMENT/backend/.env.example)) and `frontend/.env`:

| Variable | Target | Default | Description |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Backend | `amendment-dev-secret-key-change-in-prod` | Secret used for HMAC-SHA256 signing of JWT tokens. |
| `GOOGLE_CLIENT_ID` | Backend & Frontend (`VITE_GOOGLE_CLIENT_ID`) | *Unset* | Google OAuth 2.0 Web Client ID. When left unset, server runs in **Guest-only development mode** (no credentials required). |
| `MAX_PLAYERS` | Backend | `6` | Maximum number of players per room (also respects `ROOM_MAX_PLAYERS`). |
| `ALLOWED_ORIGINS` | Backend | `*` | Comma-separated list of allowed CORS origins (e.g. `http://localhost:5173`). |
| `VITE_API_URL` | Frontend | `http://localhost:8000` (dev) / `""` (prod) | Backend base URL for API & WebSocket requests. |

---

## 2. How to Run

### Backend
```bash
cd backend
python3 -m pip install -r requirements.txt
python3 app.py
# Server starts on http://0.0.0.0:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Vite dev server starts on http://localhost:5173
```

### Running Tests
- Backend: `python3 -m pytest backend/test_auth_rooms.py backend/test_api.py`
- Frontend: `npm test` inside `frontend/`

---

## 3. API Endpoints

### Authentication (`/auth`)

#### `POST /auth/guest`
Creates a guest account and issues a signed JWT.
- **Request Body** (optional):
  ```json
  { "nickname": "SwiftFox42" }
  ```
  *(If omitted or blank, a friendly call-sign is generated automatically. Nicknames are sanitized and capped at 20 characters).*
- **Response** (`200 OK`):
  ```json
  {
    "player_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "nickname": "SwiftFox42",
    "type": "guest",
    "avatar_url": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
  *Also sets an `httpOnly`, `SameSite=Lax` cookie `amendment_token`.*

#### `POST /auth/google`
Verifies Google Identity Services ID token.
- **Request Body**:
  ```json
  { "id_token": "<google_id_token>" }
  ```
- **Responses**:
  - `200 OK`: Returns same JWT shape with `type: "google"` and Google avatar.
  - `503 Service Unavailable`: If `GOOGLE_CLIENT_ID` is unset on server.
  - `401 Unauthorized`: If token is invalid or expired.

#### `GET /auth/me`
Retrieves the authenticated user.
- **Headers**: `Authorization: Bearer <token>` OR `amendment_token` cookie.
- **Response** (`200 OK`):
  ```json
  {
    "player_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "nickname": "SwiftFox42",
    "type": "guest",
    "avatar_url": null
  }
  ```

---

### Rooms & Lobby (`/rooms`)

#### `POST /rooms/create`
Creates a room with the caller as host. Requires authentication.
- **Response** (`200 OK`):
  ```json
  {
    "room_code": "AMND82",
    "host_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "status": "lobby",
    "players": [
      {
        "player_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "nickname": "SwiftFox42",
        "avatar_url": null,
        "joined_at": 1729881000.0,
        "is_host": true
      }
    ]
  }
  ```
  *Room codes are 6 uppercase characters from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no `0/O` or `1/I/L`).*

#### `POST /rooms/join`
Joins an existing room. Requires authentication.
- **Request Body**:
  ```json
  {
    "room_code": "AMND82",
    "player_id": "player-uuid"
  }
  ```
- **Validations**:
  - `player_id` must match authenticated caller (`403 Forbidden: PLAYER_MISMATCH`).
  - Code case-insensitive and trimmed; `404 Not Found: ROOM_NOT_FOUND` if absent.
  - Room status must be `"lobby"`; `409 Conflict: GAME_ALREADY_STARTED` if match has begun.
  - Room must not be full; `409 Conflict: ROOM_FULL` if at `MAX_PLAYERS`.
  - Idempotent if player is already seated in the room.

#### `GET /rooms/{room_code}`
Retrieves room state and start eligibility.
- **Response** (`200 OK`):
  ```json
  {
    "room_code": "AMND82",
    "host_id": "host-player-id",
    "status": "lobby",
    "players": [...],
    "max_players": 6,
    "can_start": true
  }
  ```

#### `POST /rooms/{room_code}/leave`
Removes caller from room. If host leaves, host role automatically transfers to the earliest-joined remaining player. If room becomes empty, it is deleted.

#### `POST /rooms/{room_code}/start`
Starts the match.
- **Restricted**: Caller must be the room `host_id` (`403 Forbidden: NOT_HOST`).
- **Condition**: Must have at least 2 seated players (`400 Bad Request: NOT_ENOUGH_PLAYERS`).
- Sets `status = "started"`, triggers engine hook `on_game_start(room)`, and broadcasts `game_started` event over WebSocket.

---

## 4. WebSocket Event Schema

Endpoint: `ws://<host>/rooms/{room_code}/ws?token=<jwt>`

### Server -> Client Events

1. **`lobby_update`**: Broadcast on join, leave, host migration, and on initial connection.
   ```json
   {
     "type": "lobby_update",
     "room_code": "AMND82",
     "host_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
     "status": "lobby",
     "players": [
       {
         "player_id": "...",
         "nickname": "SwiftFox42",
         "avatar_url": null,
         "joined_at": 1729881000.0,
         "is_host": true
       }
     ],
     "can_start": true
   }
   ```

2. **`game_started`**: Broadcast when the host triggers `POST /rooms/{room_code}/start`.
   ```json
   {
     "type": "game_started",
     "room_code": "AMND82",
     "host_id": "...",
     "players": [...]
   }
   ```

3. **`pong`**: Heartbeat response to `{"type": "ping"}`.
   ```json
   {
     "type": "pong",
     "timestamp": 1729881005.123
   }
   ```

### Disconnect Grace Period & Polling Fallback
- When a client WebSocket disconnects, the server holds a **5-second grace period**. If the player refreshes the page or reconnects within 5 seconds, their seat and host status are preserved.
- The frontend client implements **exponential backoff reconnection** and falls back to HTTP polling (`GET /rooms/{code}` every 2 seconds) if WebSocket connectivity is interrupted.

---

## 5. Teammate Integration Points

### Backend Integration

1. **Protecting Gameplay Endpoints with `get_current_user`**:
   Import `get_current_user` from `backend.auth` to protect any route:
   ```python
   from fastapi import Depends
   from backend.auth import User, get_current_user

   @app.post("/game/{game_id}/turn")
   async def take_turn(
       game_id: str,
       current_user: User = Depends(get_current_user)
   ):
       # current_user.id, current_user.nickname, current_user.type are authenticated
       ...
   ```

2. **Engine Hook on Match Start (`on_game_start`)**:
   Located in [backend/rooms.py](file:///Users/sarveshchavan/AMENDMENT/backend/rooms.py#L90):
   ```python
   def on_game_start(room: Room) -> None:
       """
       HOOK FOR GAME ENGINE OWNER:
       Called when room status changes to 'started'.
       Instantiate backend engine state, orchestrate player turn order,
       and initialize match rules here.
       """
   ```

### Frontend Integration

1. **Routing to Gameplay Screen**:
   Defined in [src/screens/LobbyScreen.tsx](file:///Users/sarveshchavan/AMENDMENT/frontend/src/screens/LobbyScreen.tsx):
   ```ts
   export const GAME_ROUTE = '/game/:roomCode';
   ```
   When `game_started` fires, `onGameStarted(roomCode, players)` is called with the seated players.

2. **Session Access**:
   Import `useSession` from `src/store/session`:
   ```tsx
   import { useSession } from '../store/session';

   const MyComponent = () => {
     const { user, token, logout } = useSession();
     ...
   };
   ```
