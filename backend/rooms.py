"""
Room and Lobby management module for AMENDMENT board game.

Provides room code generation, lobby state management, host controls,
WebSocket real-time updates with disconnect grace periods, and stale room cleanup.
"""

import os
import time
import random
import asyncio
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Tuple
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=_env_path)
except ImportError:
    pass

from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
    Query,
)
from backend.auth import (
    User,
    APIError,
    get_current_user,
    decode_access_token,
    user_store,
)

logger = logging.getLogger("amendment.rooms")

router = APIRouter(prefix="/rooms", tags=["rooms"])

# Configurable constants
MAX_PLAYERS_DEFAULT: int = int(os.getenv("MAX_PLAYERS", os.getenv("ROOM_MAX_PLAYERS", "6")))
ROOM_DISCONNECT_GRACE_SECONDS: float = 5.0
ROOM_STALE_TIMEOUT_SECONDS: float = 2 * 3600.0  # 2 hours

# 32-character unambiguous alphabet (no 0/O, 1/I/L)
UNAMBIGUOUS_ALPHABET: str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


# --- Rate Limiter for Room Join ---

class InMemoryRateLimiter:
    """Thread-safe sliding-window rate limiter per client IP."""

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._requests: Dict[str, list] = {}

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        with self._lock:
            history = self._requests.get(client_ip, [])
            cutoff = now - self.window_seconds
            valid_history = [t for t in history if t > cutoff]
            if len(valid_history) >= self.max_requests:
                self._requests[client_ip] = valid_history
                return False
            valid_history.append(now)
            self._requests[client_ip] = valid_history
            return True


join_rate_limiter = InMemoryRateLimiter(max_requests=40, window_seconds=60.0)


def check_join_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not join_rate_limiter.is_allowed(client_ip):
        raise APIError(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many join requests. Please slow down.",
            code="RATE_LIMITED"
        )


# --- Data Models ---

class RoomPlayer(BaseModel):
    player_id: str
    nickname: str
    avatar_url: Optional[str] = None
    joined_at: float = Field(default_factory=time.time)
    is_host: bool = False


class Room(BaseModel):
    code: str = Field(..., pattern=r"^[A-Z0-9]{6}$")
    host_id: str
    players: List[RoomPlayer] = []
    status: str = "lobby"  # "lobby" | "started"
    max_players: int = MAX_PLAYERS_DEFAULT
    created_at: float = Field(default_factory=time.time)
    last_active_at: float = Field(default_factory=time.time)


class JoinRoomRequest(BaseModel):
    room_code: str = Field(..., min_length=1, max_length=10)
    player_id: str = Field(..., min_length=1)


class RoomResponse(BaseModel):
    room_code: str
    host_id: str
    players: List[RoomPlayer]
    status: str


class RoomDetailResponse(BaseModel):
    room_code: str
    host_id: str
    status: str
    players: List[RoomPlayer]
    max_players: int
    can_start: bool


# --- Engine Hook ---

def on_game_start(room: Room) -> None:
    """
    HOOK FOR GAME ENGINE OWNER:
    Called when room status changes to 'started'.
    The game engine teammate can instantiate backend engine state,
    orchestrate player turn order, and prepare the match rules here.
    """
    logger.info("Hook on_game_start triggered for room: %s with %d players", room.code, len(room.players))
    # Engine owner fills in game initialization here.


# --- WebSocket Connection Manager ---

class ConnectionManager:
    """Manages active WebSocket connections, broadcasting, and disconnect grace periods."""

    def __init__(self) -> None:
        self._room_connections: Dict[str, Set[WebSocket]] = {}
        self._player_sockets: Dict[Tuple[str, str], Set[WebSocket]] = {}
        self._disconnect_timers: Dict[Tuple[str, str], asyncio.Task] = {}

    async def connect(self, room_code: str, player_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        key = (room_code, player_id)

        # Cancel disconnect grace timer if client reconnected
        if key in self._disconnect_timers:
            timer_task = self._disconnect_timers.pop(key)
            if not timer_task.done():
                timer_task.cancel()
                logger.info("Player %s reconnected to room %s within grace period. Disconnect cancelled.", player_id, room_code)

        if room_code not in self._room_connections:
            self._room_connections[room_code] = set()
        self._room_connections[room_code].add(websocket)

        if key not in self._player_sockets:
            self._player_sockets[key] = set()
        self._player_sockets[key].add(websocket)

    def disconnect_socket(self, room_code: str, player_id: str, websocket: WebSocket) -> bool:
        """Remove a closed socket. Returns True if player now has ZERO open sockets in this room."""
        if room_code in self._room_connections:
            self._room_connections[room_code].discard(websocket)
            if not self._room_connections[room_code]:
                del self._room_connections[room_code]

        key = (room_code, player_id)
        if key in self._player_sockets:
            self._player_sockets[key].discard(websocket)
            if not self._player_sockets[key]:
                del self._player_sockets[key]
                return True
        return False

    def schedule_grace_disconnect(self, room_code: str, player_id: str, callback: Any) -> None:
        """Schedule removal of player after grace period if they do not reconnect."""
        key = (room_code, player_id)

        async def _grace_worker():
            try:
                await asyncio.sleep(ROOM_DISCONNECT_GRACE_SECONDS)
                if key not in self._player_sockets:
                    logger.info("Player %s grace period expired in room %s. Executing leave.", player_id, room_code)
                    await callback(room_code, player_id)
            except asyncio.CancelledError:
                pass
            finally:
                self._disconnect_timers.pop(key, None)

        task = asyncio.create_task(_grace_worker())
        self._disconnect_timers[key] = task

    async def broadcast_to_room(self, room_code: str, message: dict) -> None:
        """Broadcast JSON message to all active sockets in the room."""
        sockets = list(self._room_connections.get(room_code, []))
        for ws in sockets:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug("Failed sending to socket in room %s: %s", room_code, e)


connection_manager = ConnectionManager()


# --- In-Memory Room Store ---

class RoomStore:
    """In-memory storage and operations for rooms."""

    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}

    def generate_code(self) -> str:
        """Generate a unique 6-character room code from unambiguous alphabet."""
        for _ in range(50):
            code = "".join(random.choices(UNAMBIGUOUS_ALPHABET, k=6))
            if code not in self._rooms:
                return code
        return ("AMND" + "".join(random.choices(UNAMBIGUOUS_ALPHABET, k=2)))[:6]

    def create_room(self, host: User) -> Room:
        code = self.generate_code()
        room = Room(
            code=code,
            host_id=host.id,
            players=[
                RoomPlayer(
                    player_id=host.id,
                    nickname=host.nickname,
                    avatar_url=host.avatar_url,
                    joined_at=time.time(),
                    is_host=True
                )
            ],
            status="lobby",
            max_players=MAX_PLAYERS_DEFAULT,
            created_at=time.time(),
            last_active_at=time.time()
        )
        self._rooms[code] = room
        return room

    def get_room(self, code: str) -> Optional[Room]:
        normalized = code.strip().upper()
        return self._rooms.get(normalized)

    def remove_room(self, code: str) -> None:
        normalized = code.strip().upper()
        self._rooms.pop(normalized, None)

    def remove_player(self, code: str, player_id: str) -> Optional[Room]:
        """
        Removes player from room.
        If host leaves, transfers host to earliest-joined remaining player.
        If room is empty, deletes the room.
        """
        room = self.get_room(code)
        if not room:
            return None

        room.players = [p for p in room.players if p.player_id != player_id]
        room.last_active_at = time.time()

        if not room.players:
            self.remove_room(code)
            return None

        # Transfer host to earliest-joined remaining player
        if room.host_id == player_id:
            room.players.sort(key=lambda p: p.joined_at)
            new_host = room.players[0]
            new_host.is_host = True
            room.host_id = new_host.player_id
            for p in room.players[1:]:
                p.is_host = False

        return room

    def cleanup_stale_rooms(self) -> int:
        """Removes empty rooms or rooms idle for > ROOM_STALE_TIMEOUT_SECONDS."""
        now = time.time()
        stale_codes = []
        for code, room in self._rooms.items():
            if not room.players or (now - room.last_active_at > ROOM_STALE_TIMEOUT_SECONDS):
                stale_codes.append(code)

        for code in stale_codes:
            self._rooms.pop(code, None)

        return len(stale_codes)


room_store = RoomStore()


# --- Real-Time Broadcast Helpers ---

async def broadcast_lobby_update(room: Room) -> None:
    """Broadcast lobby_update event to all connections in room."""
    players_data = [p.model_dump() for p in room.players]
    await connection_manager.broadcast_to_room(
        room.code,
        {
            "type": "lobby_update",
            "room_code": room.code,
            "host_id": room.host_id,
            "status": room.status,
            "players": players_data,
            "can_start": len(room.players) >= 2,
        }
    )


async def handle_grace_leave(room_code: str, player_id: str) -> None:
    """Callback after disconnect grace period expires."""
    room = room_store.remove_player(room_code, player_id)
    if room:
        await broadcast_lobby_update(room)


# --- REST Endpoints ---

@router.post("/create", response_model=RoomResponse)
async def create_room(current_user: User = Depends(get_current_user)) -> RoomResponse:
    """Create a new game room with the authenticated user as host."""
    room = room_store.create_room(current_user)
    return RoomResponse(
        room_code=room.code,
        host_id=room.host_id,
        players=room.players,
        status=room.status
    )


@router.post("/join", response_model=RoomResponse)
async def join_room(
    request: Request,
    body: JoinRoomRequest,
    current_user: User = Depends(get_current_user)
) -> RoomResponse:
    """
    Join an existing room by code.
    Validates code, lobby status, capacity, and ensures player_id matches authenticated caller.
    """
    check_join_rate_limit(request)

    if body.player_id != current_user.id:
        raise APIError(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: player_id does not match authenticated user.",
            code="PLAYER_MISMATCH"
        )

    code = body.room_code.strip().upper()
    room = room_store.get_room(code)
    if not room:
        raise APIError(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
            code="ROOM_NOT_FOUND"
        )

    if room.status != "lobby":
        raise APIError(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot join room '{code}': game has already started.",
            code="GAME_ALREADY_STARTED"
        )

    # Idempotent if player is already in room
    existing_player = next((p for p in room.players if p.player_id == current_user.id), None)
    if existing_player:
        existing_player.nickname = current_user.nickname
        existing_player.avatar_url = current_user.avatar_url
        room.last_active_at = time.time()
        await broadcast_lobby_update(room)
        return RoomResponse(
            room_code=room.code,
            host_id=room.host_id,
            players=room.players,
            status=room.status
        )

    # Check capacity
    if len(room.players) >= room.max_players:
        raise APIError(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Room '{code}' is full (maximum {room.max_players} players).",
            code="ROOM_FULL"
        )

    # Add player
    room.players.append(
        RoomPlayer(
            player_id=current_user.id,
            nickname=current_user.nickname,
            avatar_url=current_user.avatar_url,
            joined_at=time.time(),
            is_host=False
        )
    )
    room.last_active_at = time.time()

    await broadcast_lobby_update(room)

    return RoomResponse(
        room_code=room.code,
        host_id=room.host_id,
        players=room.players,
        status=room.status
    )


@router.get("/{room_code}", response_model=RoomDetailResponse)
def get_room_details(room_code: str) -> RoomDetailResponse:
    """Retrieve room details and can_start readiness."""
    code = room_code.strip().upper()
    room = room_store.get_room(code)
    if not room:
        raise APIError(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
            code="ROOM_NOT_FOUND"
        )

    return RoomDetailResponse(
        room_code=room.code,
        host_id=room.host_id,
        status=room.status,
        players=room.players,
        max_players=room.max_players,
        can_start=(len(room.players) >= 2)
    )


@router.post("/{room_code}/leave")
async def leave_room(
    room_code: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Leave a room. Host transfers to earliest player; room deleted if empty."""
    code = room_code.strip().upper()
    room = room_store.get_room(code)
    if not room:
        raise APIError(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
            code="ROOM_NOT_FOUND"
        )

    updated_room = room_store.remove_player(code, current_user.id)
    if updated_room:
        await broadcast_lobby_update(updated_room)
        return {"detail": "Left room", "room_deleted": False}
    else:
        return {"detail": "Left room", "room_deleted": True}


@router.post("/{room_code}/start")
async def start_room_game(
    room_code: str,
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Host triggers start of match.
    Validates host identity and player count (>= 2).
    Sets status to 'started', triggers hook and broadcasts game_started.
    """
    code = room_code.strip().upper()
    room = room_store.get_room(code)
    if not room:
        raise APIError(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{code}' was not found.",
            code="ROOM_NOT_FOUND"
        )

    if room.host_id != current_user.id:
        raise APIError(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the room host can start the game.",
            code="NOT_HOST"
        )

    if len(room.players) < 2:
        raise APIError(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start game: at least 2 players are required.",
            code="NOT_ENOUGH_PLAYERS"
        )

    room.status = "started"
    room.last_active_at = time.time()

    on_game_start(room)

    await connection_manager.broadcast_to_room(
        room.code,
        {
            "type": "game_started",
            "room_code": room.code,
            "host_id": room.host_id,
            "players": [p.model_dump() for p in room.players],
        }
    )

    return {"room_code": room.code, "status": "started"}


# --- WebSocket Endpoint ---

@router.websocket("/{room_code}/ws")
async def room_websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    token: Optional[str] = Query(None)
) -> None:
    """
    Real-time WebSocket endpoint for room lobby.
    Pushes lobby_update and game_started events.
    Handles ping/pong heartbeats and 5s disconnect grace period.
    """
    normalized_code = room_code.strip().upper()

    auth_token = token
    if not auth_token:
        auth_token = websocket.cookies.get("amendment_token")

    if not auth_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(auth_token)
        player_id = payload.get("sub")
        if not player_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    room = room_store.get_room(normalized_code)
    if not room:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await connection_manager.connect(normalized_code, player_id, websocket)

    await websocket.send_json({
        "type": "lobby_update",
        "room_code": room.code,
        "host_id": room.host_id,
        "status": room.status,
        "players": [p.model_dump() for p in room.players],
        "can_start": len(room.players) >= 2,
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": time.time()})
            elif msg_type == "chat":
                text = str(data.get("text", "")).strip()[:200]
                if text:
                    player_nickname = payload.get("nickname", "Player")
                    await connection_manager.broadcast_to_room(
                        normalized_code,
                        {
                            "type": "chat_message",
                            "player_id": player_id,
                            "nickname": player_nickname,
                            "text": text,
                            "timestamp": time.time(),
                        }
                    )

    except WebSocketDisconnect:
        is_fully_disconnected = connection_manager.disconnect_socket(normalized_code, player_id, websocket)
        if is_fully_disconnected:
            connection_manager.schedule_grace_disconnect(normalized_code, player_id, handle_grace_leave)
    except Exception as e:
        logger.error("WebSocket unexpected error: %s", e)
        is_fully_disconnected = connection_manager.disconnect_socket(normalized_code, player_id, websocket)
        if is_fully_disconnected:
            connection_manager.schedule_grace_disconnect(normalized_code, player_id, handle_grace_leave)


# --- Background Stale Room Cleanup Task ---

_cleanup_task: Optional[asyncio.Task] = None


async def _periodic_cleanup() -> None:
    while True:
        try:
            await asyncio.sleep(600)
            cleaned = room_store.cleanup_stale_rooms()
            if cleaned:
                logger.info("Cleaned up %d stale/idle rooms", cleaned)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in stale room cleanup: %s", e)


def start_cleanup_task() -> None:
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        try:
            loop = asyncio.get_running_loop()
            _cleanup_task = loop.create_task(_periodic_cleanup())
        except RuntimeError:
            pass
