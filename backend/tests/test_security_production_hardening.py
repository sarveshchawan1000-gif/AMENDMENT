"""
Unit and integration tests for production security hardening:
1. Production JWT secret validation (rejecting missing, dev-default, and short secrets)
2. Production CORS validation (rejecting wildcard origins with credentials)
3. Room WebSocket non-member authorization (preventing eavesdropping)
4. Rate limiting on room creation, game creation, and AI amendment compilation
"""

import os
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app import app, get_cors_configuration, game_create_rate_limiter, court_compile_rate_limiter
from backend.auth import validate_jwt_secret, DEV_JWT_SECRET
from backend.rooms import create_rate_limiter, room_store

client = TestClient(app)


# --- 1. Production JWT Secret Validation Tests ---

def test_jwt_secret_production_missing_raises(monkeypatch):
    """In production mode, missing JWT_SECRET must fail fast at startup."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "")
    with pytest.raises(RuntimeError, match="JWT_SECRET environment variable is missing"):
        validate_jwt_secret()


def test_jwt_secret_production_dev_default_raises(monkeypatch):
    """In production mode, using the development default secret must fail fast."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", DEV_JWT_SECRET)
    with pytest.raises(RuntimeError, match="cannot use the development default"):
        validate_jwt_secret()


def test_jwt_secret_production_too_short_raises(monkeypatch):
    """In production mode, secret shorter than 32 characters must fail fast."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "short-secret-under-32-chars")
    with pytest.raises(RuntimeError, match="too short"):
        validate_jwt_secret()


def test_jwt_secret_production_strong_secret_passes(monkeypatch):
    """In production mode, strong 32+ char secret succeeds."""
    strong = "super-secret-random-token-minimum-32-characters-entropy"
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", strong)
    assert validate_jwt_secret() == strong


def test_jwt_secret_development_defaults_safely(monkeypatch):
    """In development mode, unset JWT_SECRET defaults safely to DEV_JWT_SECRET."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("JWT_SECRET", "")
    assert validate_jwt_secret() == DEV_JWT_SECRET


# --- 2. Production CORS Configuration Tests ---

def test_cors_production_wildcard_rejected(monkeypatch):
    """In production mode, wildcard '*' origins are strictly forbidden with credentials."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="Wildcard '\\*' is strictly forbidden"):
        get_cors_configuration()


def test_cors_production_missing_origins_rejected(monkeypatch):
    """In production mode, empty or missing ALLOWED_ORIGINS raises RuntimeError."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "")
    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS must be set"):
        get_cors_configuration()


def test_cors_production_explicit_origins_accepted(monkeypatch):
    """In production mode, explicit HTTPS domains are accepted with allow_credentials=True."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://amendment.game,https://admin.amendment.game")
    origins, allow_credentials = get_cors_configuration()
    assert origins == ["https://amendment.game", "https://admin.amendment.game"]
    assert allow_credentials is True


def test_cors_development_defaults_to_local_origins(monkeypatch):
    """In development mode, unset ALLOWED_ORIGINS defaults to local developer servers."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("ALLOWED_ORIGINS", "")
    origins, allow_credentials = get_cors_configuration()
    assert "http://localhost:3000" in origins
    assert allow_credentials is True


# --- 3. Room WebSocket Authorization Tests ---

def test_websocket_non_member_access_rejected():
    """
    An authenticated player who has NOT joined the room must be rejected with WS 1008
    without leaking room or player state.
    """
    # 1. Host creates room
    host_res = client.post("/auth/guest", json={"nickname": "LobbyHost"}).json()
    host_token = host_res["token"]
    create_res = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()
    room_code = create_res["room_code"]

    # 2. Outsider gets a valid JWT but does NOT call /rooms/join
    outsider_res = client.post("/auth/guest", json={"nickname": "Outsider"}).json()
    outsider_token = outsider_res["token"]

    # 3. Outsider attempts to connect to room WebSocket -> Must be rejected with 1008
    with pytest.raises(Exception) as exc_info:
        with client.websocket_connect(f"/rooms/{room_code}/ws?token={outsider_token}") as ws:
            ws.receive_json()

    # Verify connection was terminated before sending any messages
    assert "1008" in str(exc_info.value) or "WebSocketDisconnect" in str(type(exc_info.value))


def test_websocket_legitimate_member_reconnection_preserved():
    """Legitimate room member can connect and reconnect cleanly."""
    host_res = client.post("/auth/guest", json={"nickname": "ReconnectHost"}).json()
    host_token = host_res["token"]
    host_id = host_res["player_id"]
    create_res = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()
    room_code = create_res["room_code"]

    # Connect host
    with client.websocket_connect(f"/rooms/{room_code}/ws?token={host_token}") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "lobby_update"
        assert msg["host_id"] == host_id

    # Reconnect host after clean disconnect
    with client.websocket_connect(f"/rooms/{room_code}/ws?token={host_token}") as ws2:
        msg2 = ws2.receive_json()
        assert msg2["type"] == "lobby_update"


# --- 4. Rate Limiting Tests ---

def test_room_creation_rate_limit(monkeypatch):
    """Exceeding room creation rate limit triggers HTTP 429 Too Many Requests."""
    host_res = client.post("/auth/guest", json={"nickname": "RateUser"}).json()
    token = host_res["token"]

    # Clear limiter state for test isolation
    create_rate_limiter._requests.clear()

    # Exhaust the 20-request bucket
    test_ip = "192.168.1.100"
    for _ in range(20):
        res = client.post(
            "/rooms/create",
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": test_ip}
        )
        assert res.status_code == 200

    # 21st request from same IP must be 429
    blocked_res = client.post(
        "/rooms/create",
        headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": test_ip}
    )
    assert blocked_res.status_code == 429
    assert blocked_res.json()["detail"]["code"] == "RATE_LIMITED"


def test_game_creation_rate_limit():
    """Exceeding game creation rate limit triggers HTTP 429 Too Many Requests."""
    game_create_rate_limiter._requests.clear()
    test_ip = "192.168.1.101"
    settings = {"board_size": 6, "dice_type": "1d6", "win_target": 21, "mode": "live", "max_rules": 12, "amend_every": 1}
    players = [{"id": "p1", "name": "P1"}, {"id": "p2", "name": "P2"}]

    # Fill the 60-request bucket
    for _ in range(60):
        res = client.post(
            "/game/new",
            json={"settings": settings, "players": players},
            headers={"X-Forwarded-For": test_ip}
        )
        assert res.status_code == 201

    # 61st request must be 429
    blocked_res = client.post(
        "/game/new",
        json={"settings": settings, "players": players},
        headers={"X-Forwarded-For": test_ip}
    )
    assert blocked_res.status_code == 429
    assert "Too many game creation attempts" in blocked_res.json()["detail"]


def test_court_compile_rate_limit():
    """Exceeding AI amendment compilation rate limit triggers HTTP 429."""
    court_compile_rate_limiter._requests.clear()
    test_ip = "192.168.1.102"
    payload = {"text": "Whenever you roll 6, gain 2 points"}

    for _ in range(30):
        # We don't care if compile succeeds or returns error from LLM, just that rate limiter counts it
        court_compile_rate_limiter.is_allowed(test_ip)

    # The 31st request from that IP must be blocked by the endpoint
    blocked_res = client.post(
        "/court/compile",
        json=payload,
        headers={"X-Forwarded-For": test_ip}
    )
    assert blocked_res.status_code == 429
    assert "Too many amendment compilation requests" in blocked_res.json()["detail"]
