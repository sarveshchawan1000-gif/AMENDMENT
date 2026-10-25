"""
Tests for AMENDMENT Auth and Rooms modules.
Tests guest auth, Google auth fallback, invalid/expired tokens,
room creation, join, leave, host transfer, room start, and WebSocket broadcasts.
"""

import os
import time
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.rooms import room_store, UNAMBIGUOUS_ALPHABET

client = TestClient(app)


def test_auth_guest_auto_nickname():
    """POST /auth/guest without nickname returns generated nickname and valid JWT."""
    res = client.post("/auth/guest", json={})
    assert res.status_code == 200
    data = res.json()
    assert "player_id" in data
    assert "nickname" in data
    assert len(data["nickname"]) > 0
    assert data["type"] == "guest"
    assert "token" in data
    assert "amendment_token" in res.cookies


def test_auth_guest_custom_nickname_sanitization():
    """POST /auth/guest sanitizes HTML and limits length to 20 chars."""
    dirty_name = "<script>alert('xss')</script> SuperLongNickNameExceedingTwentyCharacters"
    res = client.post("/auth/guest", json={"nickname": dirty_name})
    assert res.status_code == 200
    data = res.json()
    assert "<script>" not in data["nickname"]
    assert len(data["nickname"]) <= 20


def test_auth_me_bearer_header():
    """GET /auth/me returns current user when valid Bearer token provided."""
    login_res = client.post("/auth/guest", json={"nickname": "TestJudge"})
    token = login_res.json()["token"]
    player_id = login_res.json()["player_id"]

    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["player_id"] == player_id
    assert data["nickname"] == "TestJudge"
    assert data["type"] == "guest"


def test_auth_me_cookie():
    """GET /auth/me returns user via amendment_token cookie."""
    login_res = client.post("/auth/guest", json={"nickname": "CookieUser"})
    token = login_res.json()["token"]

    client.cookies.set("amendment_token", token)
    me_res = client.get("/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["nickname"] == "CookieUser"
    client.cookies.clear()


def test_auth_me_unauthorized():
    """GET /auth/me without token returns 401 with UNAUTHORIZED code."""
    client.cookies.clear()
    res = client.get("/auth/me")
    assert res.status_code == 401
    err = res.json()["detail"]
    assert err["code"] == "UNAUTHORIZED"


def test_auth_me_invalid_token():
    """GET /auth/me with bogus token returns 401 INVALID_TOKEN."""
    client.cookies.clear()
    res = client.get("/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"})
    assert res.status_code == 401
    err = res.json()["detail"]
    assert err["code"] == "INVALID_TOKEN"


def test_auth_google_unconfigured():
    """POST /auth/google returns 503 if GOOGLE_CLIENT_ID is not configured."""
    from backend import auth
    orig = auth.GOOGLE_CLIENT_ID
    auth.GOOGLE_CLIENT_ID = ""

    res = client.post("/auth/google", json={"id_token": "fake-google-token"})
    assert res.status_code == 503
    err = res.json()["detail"]
    assert err["code"] == "GOOGLE_AUTH_UNAVAILABLE"

    auth.GOOGLE_CLIENT_ID = orig


def test_room_create_and_details():
    """POST /rooms/create creates room with caller as host, 6 unambiguous chars code."""
    login_res = client.post("/auth/guest", json={"nickname": "HostFox"})
    token = login_res.json()["token"]
    host_id = login_res.json()["player_id"]
    headers = {"Authorization": f"Bearer {token}"}

    create_res = client.post("/rooms/create", headers=headers)
    assert create_res.status_code == 200
    data = create_res.json()

    code = data["room_code"]
    assert len(code) == 6
    assert all(c in UNAMBIGUOUS_ALPHABET for c in code)
    assert data["host_id"] == host_id
    assert len(data["players"]) == 1
    assert data["players"][0]["is_host"] is True

    detail_res = client.get(f"/rooms/{code}")
    assert detail_res.status_code == 200
    details = detail_res.json()
    assert details["room_code"] == code
    assert details["can_start"] is False


def test_room_join_and_readiness():
    """Player 2 joins, can_start flips to True."""
    host_token = client.post("/auth/guest", json={"nickname": "RoomHost"}).json()["token"]
    create_data = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()
    code = create_data["room_code"]

    p2_data = client.post("/auth/guest", json={"nickname": "PlayerTwo"}).json()
    p2_token = p2_data["token"]
    p2_id = p2_data["player_id"]

    join_res = client.post(
        "/rooms/join",
        json={"room_code": code.lower(), "player_id": p2_id},
        headers={"Authorization": f"Bearer {p2_token}"}
    )
    assert join_res.status_code == 200
    join_data = join_res.json()
    assert len(join_data["players"]) == 2

    detail_res = client.get(f"/rooms/{code}")
    assert detail_res.json()["can_start"] is True


def test_room_join_mismatched_player_id_rejected():
    """POST /rooms/join with player_id not matching caller returns 403."""
    host_token = client.post("/auth/guest", json={"nickname": "RoomHost"}).json()["token"]
    code = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()["room_code"]

    p2_token = client.post("/auth/guest", json={"nickname": "Impersonator"}).json()["token"]
    bad_join = client.post(
        "/rooms/join",
        json={"room_code": code, "player_id": "someone-else-id"},
        headers={"Authorization": f"Bearer {p2_token}"}
    )
    assert bad_join.status_code == 403
    assert bad_join.json()["detail"]["code"] == "PLAYER_MISMATCH"


def test_room_join_not_found():
    """Joining non-existent room returns 404 ROOM_NOT_FOUND."""
    token = client.post("/auth/guest", json={"nickname": "Seeker"}).json()
    res = client.post(
        "/rooms/join",
        json={"room_code": "NONEX1", "player_id": token["player_id"]},
        headers={"Authorization": f"Bearer {token['token']}"}
    )
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "ROOM_NOT_FOUND"


def test_room_join_full():
    """Joining full room returns 409 ROOM_FULL."""
    host_token = client.post("/auth/guest", json={"nickname": "FullHost"}).json()["token"]
    code = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()["room_code"]

    room = room_store.get_room(code)
    room.max_players = 2

    p2_data = client.post("/auth/guest", json={"nickname": "P2"}).json()
    client.post("/rooms/join", json={"room_code": code, "player_id": p2_data["player_id"]}, headers={"Authorization": f"Bearer {p2_data['token']}"})

    p3_data = client.post("/auth/guest", json={"nickname": "P3"}).json()
    res = client.post("/rooms/join", json={"room_code": code, "player_id": p3_data["player_id"]}, headers={"Authorization": f"Bearer {p3_data['token']}"})
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "ROOM_FULL"


def test_room_leave_and_host_transfer():
    """Host leaves room -> host transfers to next player. When last player leaves, room is deleted."""
    host_data = client.post("/auth/guest", json={"nickname": "LeavingHost"}).json()
    code = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_data['token']}"}).json()["room_code"]

    p2_data = client.post("/auth/guest", json={"nickname": "NextHost"}).json()
    client.post("/rooms/join", json={"room_code": code, "player_id": p2_data["player_id"]}, headers={"Authorization": f"Bearer {p2_data['token']}"})

    leave_res = client.post(f"/rooms/{code}/leave", headers={"Authorization": f"Bearer {host_data['token']}"})
    assert leave_res.status_code == 200
    assert leave_res.json()["room_deleted"] is False

    detail_res = client.get(f"/rooms/{code}")
    details = detail_res.json()
    assert details["host_id"] == p2_data["player_id"]
    assert details["players"][0]["is_host"] is True

    leave_res2 = client.post(f"/rooms/{code}/leave", headers={"Authorization": f"Bearer {p2_data['token']}"})
    assert leave_res2.status_code == 200
    assert leave_res2.json()["room_deleted"] is True

    assert client.get(f"/rooms/{code}").status_code == 404


def test_room_start_authorization():
    """Host starts room with >= 2 players. Non-host gets 403, 1 player gets 400."""
    host_data = client.post("/auth/guest", json={"nickname": "StartHost"}).json()
    code = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_data['token']}"}).json()["room_code"]

    alone_res = client.post(f"/rooms/{code}/start", headers={"Authorization": f"Bearer {host_data['token']}"})
    assert alone_res.status_code == 400
    assert alone_res.json()["detail"]["code"] == "NOT_ENOUGH_PLAYERS"

    p2_data = client.post("/auth/guest", json={"nickname": "StartP2"}).json()
    client.post("/rooms/join", json={"room_code": code, "player_id": p2_data["player_id"]}, headers={"Authorization": f"Bearer {p2_data['token']}"})

    nonhost_res = client.post(f"/rooms/{code}/start", headers={"Authorization": f"Bearer {p2_data['token']}"})
    assert nonhost_res.status_code == 403
    assert nonhost_res.json()["detail"]["code"] == "NOT_HOST"

    start_res = client.post(f"/rooms/{code}/start", headers={"Authorization": f"Bearer {host_data['token']}"})
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "started"

    # Joining a started room returns 409 GAME_ALREADY_STARTED
    p3_data = client.post("/auth/guest", json={"nickname": "LateP3"}).json()
    late_join = client.post("/rooms/join", json={"room_code": code, "player_id": p3_data["player_id"]}, headers={"Authorization": f"Bearer {p3_data['token']}"})
    assert late_join.status_code == 409
    assert late_join.json()["detail"]["code"] == "GAME_ALREADY_STARTED"


def test_room_websocket():
    """WebSocket connection receives lobby_update on connect and responds to ping."""
    host_data = client.post("/auth/guest", json={"nickname": "WSHost"}).json()
    code = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_data['token']}"}).json()["room_code"]

    with client.websocket_connect(f"/rooms/{code}/ws?token={host_data['token']}") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "lobby_update"
        assert init_msg["room_code"] == code

        ws.send_json({"type": "ping"})
        pong_msg = ws.receive_json()
        assert pong_msg["type"] == "pong"
