"""
Integration tests for authoritative multiplayer game synchronization,
shared game_id broadcast, and player authentication / impersonation security.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app import app, games
from backend.rooms import room_store

client = TestClient(app)


def test_authoritative_multiplayer_game_sync():
    """
    Verify:
    1. Room start creates exactly ONE authoritative backend game.
    2. Room response, detail, and WebSocket all carry the identical game_id.
    3. Multiplayer gameplay endpoints strictly require authentication.
    4. Impersonation (acting with wrong token) is rejected with 403 Forbidden.
    5. Correct player acts with 200 OK, and all players see identical state.
    """
    # 1. Host and Guest authenticate
    host_res = client.post("/auth/guest", json={"nickname": "RoomHost"}).json()
    host_token = host_res["token"]
    host_id = host_res["player_id"]

    guest_res = client.post("/auth/guest", json={"nickname": "RoomGuest"}).json()
    guest_token = guest_res["token"]
    guest_id = guest_res["player_id"]

    # 2. Host creates room
    create_res = client.post(
        "/rooms/create",
        headers={"Authorization": f"Bearer {host_token}"}
    ).json()
    room_code = create_res["room_code"]

    # 3. Guest joins room
    join_res = client.post(
        "/rooms/join",
        json={"room_code": room_code, "player_id": guest_id},
        headers={"Authorization": f"Bearer {guest_token}"}
    ).json()
    assert len(join_res["players"]) == 2

    # 4. Connect guest to WebSocket and verify game_started contains authoritative game_id
    with client.websocket_connect(f"/rooms/{room_code}/ws?token={guest_token}") as ws:
        init_ws = ws.receive_json()
        assert init_ws["type"] == "lobby_update"

        # Host starts the match
        start_res = client.post(
            f"/rooms/{room_code}/start",
            headers={"Authorization": f"Bearer {host_token}"}
        ).json()
        assert start_res["status"] == "started"
        game_id = start_res.get("game_id")
        assert game_id is not None
        assert len(game_id) > 10

        # Guest receives game_started broadcast with the matching game_id
        ws_msg = ws.receive_json()
        assert ws_msg["type"] == "game_started"
        assert ws_msg["game_id"] == game_id
        assert ws_msg["room_code"] == room_code

    # 5. Detail polling also reflects identical game_id
    detail = client.get(f"/rooms/{room_code}").json()
    assert detail["status"] == "started"
    assert detail["game_id"] == game_id

    # 6. Verify game exists in backend authoritative store
    assert game_id in games
    state = games[game_id]
    assert state["is_multiplayer"] is True
    assert state["room_code"] == room_code
    assert [p["id"] for p in state["players"]] == [host_id, guest_id]

    # 7. Unauthenticated roll on multiplayer game -> 401 Unauthorized
    unauth_client = TestClient(app)
    unauth_roll = unauth_client.post(f"/game/{game_id}/roll", json={"player_id": host_id})
    assert unauth_roll.status_code == 401

    # 8. Impersonation: Guest tries to roll for Host -> 403 Forbidden
    impersonate_roll = client.post(
        f"/game/{game_id}/roll",
        json={"player_id": host_id},
        headers={"Authorization": f"Bearer {guest_token}"}
    )
    assert impersonate_roll.status_code == 403
    assert "Forbidden" in impersonate_roll.json()["detail"]

    # 9. Legitimate roll: Host rolls for Host -> 200 OK
    legit_roll = client.post(
        f"/game/{game_id}/roll",
        json={"player_id": host_id},
        headers={"Authorization": f"Bearer {host_token}"}
    )
    assert legit_roll.status_code == 200
    roll_data = legit_roll.json()
    assert roll_data["state"]["turn"] >= 1
    assert roll_data["state"]["players"][0]["position"] > 1

    # 10. State consistency: Both Host and Guest fetch identical state
    host_state = client.get(f"/game/{game_id}").json()["state"]
    guest_state = client.get(f"/game/{game_id}").json()["state"]
    assert host_state == guest_state

    # 11. Host attempting to roll again when it is Guest's turn -> 400 Bad Request
    if host_state["current_player"] == 1:  # Now Guest's turn
        out_of_turn = client.post(
            f"/game/{game_id}/roll",
            json={"player_id": host_id},
            headers={"Authorization": f"Bearer {host_token}"}
        )
        assert out_of_turn.status_code == 400
        assert "Not" in out_of_turn.json()["detail"]


def test_multiplayer_amendment_auth_and_impersonation():
    """Verify amendment submissions require authentication and reject impersonation."""
    host_res = client.post("/auth/guest", json={"nickname": "AmendHost"}).json()
    host_token = host_res["token"]
    host_id = host_res["player_id"]

    guest_res = client.post("/auth/guest", json={"nickname": "AmendGuest"}).json()
    guest_token = guest_res["token"]
    guest_id = guest_res["player_id"]

    create_res = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()
    code = create_res["room_code"]
    client.post("/rooms/join", json={"room_code": code, "player_id": guest_id}, headers={"Authorization": f"Bearer {guest_token}"})
    start_res = client.post(f"/rooms/{code}/start", headers={"Authorization": f"Bearer {host_token}"}).json()
    game_id = start_res["game_id"]

    # Roll to activate turn
    client.post(f"/game/{game_id}/roll", json={"player_id": host_id}, headers={"Authorization": f"Bearer {host_token}"})

    # 1. Unauthenticated amend -> 401
    unauth = TestClient(app)
    res_unauth = unauth.post(f"/game/{game_id}/amend", json={"player_id": host_id, "amendment_id": "AMEND_001"})
    assert res_unauth.status_code == 401

    # 2. Impersonated amend (Guest token, Host player_id) -> 403 Forbidden
    res_impersonate = client.post(
        f"/game/{game_id}/amend",
        json={"player_id": host_id, "amendment_id": "AMEND_001"},
        headers={"Authorization": f"Bearer {guest_token}"}
    )
    assert res_impersonate.status_code == 403
    assert "Forbidden" in res_impersonate.json()["detail"]

    # 3. Impersonated pass-amendment -> 403 Forbidden
    res_pass_impersonate = client.post(
        f"/game/{game_id}/pass-amendment",
        json={"player_id": host_id},
        headers={"Authorization": f"Bearer {guest_token}"}
    )
    assert res_pass_impersonate.status_code == 403
    assert "Forbidden" in res_pass_impersonate.json()["detail"]


def test_concurrent_turn_actions_safety():
    """Verify concurrent double-roll requests from the same player are safely handled."""
    host_res = client.post("/auth/guest", json={"nickname": "ConcHost"}).json()
    host_token = host_res["token"]
    host_id = host_res["player_id"]

    guest_res = client.post("/auth/guest", json={"nickname": "ConcGuest"}).json()
    guest_token = guest_res["token"]
    guest_id = guest_res["player_id"]

    create_res = client.post("/rooms/create", headers={"Authorization": f"Bearer {host_token}"}).json()
    code = create_res["room_code"]
    client.post("/rooms/join", json={"room_code": code, "player_id": guest_id}, headers={"Authorization": f"Bearer {guest_token}"})
    start_res = client.post(f"/rooms/{code}/start", headers={"Authorization": f"Bearer {host_token}"}).json()
    game_id = start_res["game_id"]

    # First roll succeeds
    r1 = client.post(f"/game/{game_id}/roll", json={"player_id": host_id}, headers={"Authorization": f"Bearer {host_token}"})
    assert r1.status_code == 200

    # Immediate duplicate roll from Host when phase is active or turn advanced
    r2 = client.post(f"/game/{game_id}/roll", json={"player_id": host_id}, headers={"Authorization": f"Bearer {host_token}"})
    # Must be safely rejected with 400 Bad Request (either active amendment phase or not their turn)
    assert r2.status_code == 400


def test_local_pass_and_play_remains_unauthenticated():
    """Verify local pass-and-play games created via /game/new do not require JWT tokens."""
    settings = {
        "board_size": 6,
        "dice_type": "1d6",
        "win_target": 21,
        "mode": "live",
        "max_rules": 12,
        "amend_every": 1
    }
    players = [{"id": "P1", "name": "LocalAlice"}, {"id": "P2", "name": "LocalBob"}]
    res = client.post("/game/new", json={"settings": settings, "players": players})
    assert res.status_code == 201
    game_id = res.json()["game_id"]

    # Local roll without token succeeds
    roll = client.post(f"/game/{game_id}/roll", json={"player_id": "P1"})
    assert roll.status_code == 200
    assert roll.json()["state"]["turn"] >= 1

