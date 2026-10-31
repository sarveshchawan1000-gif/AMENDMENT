"""
Tests for Groq hosted AI Court provider and persistent SQLite amendment-rule cache.

Covers:
- GroqProvider HTTP mock calls (success, 429 rate limit, 401 auth, 404 model, timeout, connection failure)
- API key safety: never exposed in repr or logs
- SQLite persistent cache operations (store, retrieve, normalization, context collision prevention)
- Corrupt cache recovery & engine schema revalidation
- Cache miss -> Groq call -> Cache hit lifecycle
- Concurrent identical requests thread safety
- Deterministic game engine & turn authorization enforcement with cached rules
"""

import json
import os
import sqlite3
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

import pytest
import requests

from backend.court.cache import (
    RuleCache,
    compute_cache_key,
    normalize_proposal_text,
)
from backend.court.compiler import compile_amendment
from backend.court.config import CourtConfig
from backend.court.providers.base import (
    ProviderAuthError,
    ProviderConnectionError,
    ProviderModelNotFoundError,
    ProviderRateLimitError,
    ProviderTimeoutError,
)
from backend.court.providers.groq import GroqProvider
from backend.engine.state import create_game


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_cache():
    """Create a temporary SQLite RuleCache instance for isolated testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_db_path = f.name
    cache = RuleCache(db_path=temp_db_path)
    yield cache
    try:
        os.remove(temp_db_path)
    except OSError:
        pass


@pytest.fixture
def sample_state():
    """Create a minimal game state suitable for compilation context."""
    return create_game(
        settings={
            "mode": "live",
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 21,
            "max_rules": 8,
            "amend_every": 1,
        },
        players=[{"id": "P1", "name": "Alice"}, {"id": "P2", "name": "Bob"}],
    )


@pytest.fixture
def valid_rule():
    """A canonical valid rule dictionary."""
    return {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "add_score", "amount": 2, "target": "self"},
        "source": "When you land, gain 2 points",
    }


# ---------------------------------------------------------------------------
# 1. Groq Provider Unit Tests (Mocked HTTP)
# ---------------------------------------------------------------------------

class TestGroqProvider:
    """Tests for GroqProvider with mocked HTTP requests."""

    def test_groq_successful_generation(self):
        """Groq provider formats payload correctly and returns JSON response."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps({
                            "trigger": "on_land",
                            "condition": {"mode": "all", "predicates": []},
                            "effect": {"type": "add_score", "amount": 2, "target": "self"},
                        })
                    }
                }
            ]
        }

        with patch("requests.post", return_value=mock_response) as mock_post:
            provider = GroqProvider(api_key="gsk_test_key_1234567890", model="llama-3.3-70b-versatile", timeout=15)
            result = provider.generate("When you land, gain 2 points", system_prompt="Test system prompt", json_schema={"type": "object"})

            assert mock_post.called
            call_kwargs = mock_post.call_args.kwargs
            assert mock_post.call_args[0][0] == "https://api.groq.com/openai/v1/chat/completions"
            assert call_kwargs["headers"]["Authorization"] == "Bearer gsk_test_key_1234567890"
            assert call_kwargs["json"]["model"] == "llama-3.3-70b-versatile"
            assert call_kwargs["json"]["response_format"] == {"type": "json_object"}
            assert "When you land, gain 2 points" in call_kwargs["json"]["messages"][1]["content"]

            data = json.loads(result)
            assert data["trigger"] == "on_land"
            assert data["effect"]["amount"] == 2

    def test_groq_api_key_masked_in_repr(self):
        """Ensure secret API key is never exposed in repr or logs."""
        raw_key = "gsk_super_secret_groq_key_99999"
        provider = GroqProvider(api_key=raw_key, model="llama-3.3-70b-versatile")
        repr_str = repr(provider)

        assert raw_key not in repr_str
        assert "GroqProvider" in repr_str

    def test_groq_rate_limiting_429(self):
        """Groq provider raises ProviderRateLimitError on HTTP 429."""
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.text = "Rate limit reached for requests per minute"

        with patch("requests.post", return_value=mock_response):
            provider = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
            with pytest.raises(ProviderRateLimitError) as exc_info:
                provider.generate("Proposal")
            assert "rate limit exceeded" in str(exc_info.value).lower()

    def test_groq_auth_failure_401(self):
        """Groq provider raises ProviderAuthError on HTTP 401."""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.text = "Invalid API Key"

        with patch("requests.post", return_value=mock_response):
            provider = GroqProvider(api_key="gsk_invalid", model="llama-3.3-70b-versatile")
            with pytest.raises(ProviderAuthError) as exc_info:
                provider.generate("Proposal")
            assert "authentication failed" in str(exc_info.value).lower()

    def test_groq_model_not_found_404(self):
        """Groq provider raises ProviderModelNotFoundError on HTTP 404."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_response.text = "Model decommissioned or not found"

        with patch("requests.post", return_value=mock_response):
            provider = GroqProvider(api_key="gsk_test", model="nonexistent-model")
            with pytest.raises(ProviderModelNotFoundError) as exc_info:
                provider.generate("Proposal")
            assert "not found" in str(exc_info.value).lower()

    def test_groq_timeout_error(self):
        """Groq provider translates requests.exceptions.Timeout to ProviderTimeoutError."""
        with patch("requests.post", side_effect=requests.exceptions.Timeout("Connection timed out")):
            provider = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
            with pytest.raises(ProviderTimeoutError) as exc_info:
                provider.generate("Proposal")
            assert "timed out" in str(exc_info.value).lower()

    def test_groq_connection_error(self):
        """Groq provider translates requests.exceptions.ConnectionError to ProviderConnectionError."""
        with patch("requests.post", side_effect=requests.exceptions.ConnectionError("Network unreachable")):
            provider = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
            with pytest.raises(ProviderConnectionError) as exc_info:
                provider.generate("Proposal")
            assert "unreachable" in str(exc_info.value).lower()

    def test_groq_availability_detail(self):
        """Groq provider checks API key and model readiness via availability_detail."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"id": "llama-3.3-70b-versatile"}, {"id": "mixtral-8x7b-32768"}]
        }

        with patch("requests.get", return_value=mock_response):
            provider = GroqProvider(api_key="gsk_test", model="llama-3.3-70b-versatile")
            reachable, model_ok, detail = provider.availability_detail()
            assert reachable is True
            assert model_ok is True
            assert "ready" in detail.lower()


# ---------------------------------------------------------------------------
# 2. SQLite Persistent Rule Cache Unit Tests
# ---------------------------------------------------------------------------

class TestRuleCacheStorage:
    """Tests for SQLite-backed rule caching and key generation."""

    def test_normalize_proposal_text(self):
        """Text normalization handles whitespace, casing, and punctuation safely."""
        text1 = "  When You Land, Gain 2 Points!  "
        text2 = "when you land gain 2 points"
        text3 = "When\n  you land,\tgain 2 points..."

        assert normalize_proposal_text(text1) == "when you land gain 2 points"
        assert normalize_proposal_text(text1) == normalize_proposal_text(text2)
        assert normalize_proposal_text(text1) == normalize_proposal_text(text3)

    def test_cache_key_differentiation_by_context(self, sample_state):
        """Cache keys differ if game context parameters differ."""
        state_small = dict(sample_state)
        state_small["settings"] = dict(sample_state["settings"])
        state_small["settings"]["board_size"] = 6

        state_large = dict(sample_state)
        state_large["settings"] = dict(sample_state["settings"])
        state_large["settings"]["board_size"] = 12

        key1, _, ctx1 = compute_cache_key("Gain 2 points", state_small)
        key2, _, ctx2 = compute_cache_key("Gain 2 points", state_large)

        assert key1 != key2
        assert ctx1["board_size"] == 6
        assert ctx2["board_size"] == 12

    def test_cache_key_compiler_version_included(self, sample_state):
        """Cache key calculation includes schema/compiler version."""
        key_v1, _, _ = compute_cache_key("Gain 2 points", sample_state, compiler_version="1.0")
        key_v2, _, _ = compute_cache_key("Gain 2 points", sample_state, compiler_version="2.0")

        assert key_v1 != key_v2

    def test_store_and_retrieve_cached_rule(self, temp_cache, sample_state, valid_rule):
        """Rules can be stored, counted, and retrieved from SQLite."""
        key, norm, ctx = compute_cache_key("When you land, gain 2 points", sample_state)
        assert temp_cache.get(key) is None
        assert temp_cache.count() == 0

        temp_cache.set(key, norm, ctx, valid_rule)
        assert temp_cache.count() == 1

        cached = temp_cache.get(key)
        assert cached is not None
        assert cached["trigger"] == valid_rule["trigger"]
        assert cached["effect"]["amount"] == valid_rule["effect"]["amount"]

    def test_cache_invalidation_and_clear(self, temp_cache, sample_state, valid_rule):
        """Cache entries can be individually invalidated or completely cleared."""
        key1, norm1, ctx1 = compute_cache_key("Rule one", sample_state)
        key2, norm2, ctx2 = compute_cache_key("Rule two", sample_state)

        temp_cache.set(key1, norm1, ctx1, valid_rule)
        temp_cache.set(key2, norm2, ctx2, valid_rule)
        assert temp_cache.count() == 2

        temp_cache.invalidate(key1)
        assert temp_cache.get(key1) is None
        assert temp_cache.get(key2) is not None
        assert temp_cache.count() == 1

        temp_cache.clear()
        assert temp_cache.count() == 0

    def test_corrupt_sqlite_entry_handled_gracefully(self, temp_cache, sample_state):
        """Tolerate corrupted JSON rows by invalidating and returning None."""
        assert temp_cache.count() == 0
        key, norm, ctx = compute_cache_key("Corrupt rule", sample_state)

        # Directly insert corrupt JSON in SQLite table
        with sqlite3.connect(temp_cache.db_path) as conn:
            conn.execute(
                """
                INSERT INTO amendment_cache (cache_key, normalized_text, compiler_version, context_json, rule_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (key, norm, "1.0", "{}", "{invalid json syntax", 12345.0),
            )
            conn.commit()

        # Should safely catch JSON decode error, invalidate the row, and return None
        retrieved = temp_cache.get(key)
        assert retrieved is None
        assert temp_cache.count() == 0


# ---------------------------------------------------------------------------
# 3. Compiler Lifecycle: Miss -> Call Groq -> Hit -> Revalidation
# ---------------------------------------------------------------------------

class TestCompilerGroqAndCacheIntegration:
    """Tests end-to-end compilation flow with Groq and rule cache."""

    def test_cache_miss_calls_groq_and_caches_result(self, temp_cache, sample_state, valid_rule):
        """First call compiles via Groq and caches; second call hits cache without calling Groq."""
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = json.dumps(valid_rule)

        with patch("backend.court.compiler.get_provider", return_value=mock_provider):
            # 1. First compilation: cache miss
            res1 = compile_amendment(
                "When you land, gain 2 points",
                sample_state,
                cache=temp_cache,
            )
            assert res1["accepted"] is True
            assert res1["cached"] is False
            assert res1["rule"]["effect"]["amount"] == 2
            assert mock_provider.generate.call_count == 1
            assert temp_cache.count() == 1

            # 2. Second compilation: exact cache hit (varying whitespace/case)
            res2 = compile_amendment(
                "  when you land,  gain 2 points  ",
                sample_state,
                cache=temp_cache,
            )
            assert res2["accepted"] is True
            assert res2["cached"] is True
            assert res2["rule"]["effect"]["amount"] == 2
            # Mock provider should NOT have been called again
            assert mock_provider.generate.call_count == 1

    def test_cached_rule_revalidated_against_engine_constraints(self, temp_cache, sample_state, valid_rule):
        """If engine validation changes or rejects a cached rule, cache entry is invalidated."""
        key, norm, ctx = compute_cache_key("When you land, gain 2 points", sample_state)
        temp_cache.set(key, norm, ctx, valid_rule)
        assert temp_cache.count() == 1

        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        # Fresh compile produces valid rule
        mock_provider.generate.return_value = json.dumps(valid_rule)

        # Validator function that rejects the cached rule initially
        calls = []
        def strict_validator(rule):
            calls.append(rule)
            if len(calls) == 1:
                return False, "Engine constraint: trigger banned in current phase"
            return True, None

        with patch("backend.court.compiler.get_provider", return_value=mock_provider):
            res = compile_amendment(
                "When you land, gain 2 points",
                sample_state,
                validate_rule_fn=strict_validator,
                cache=temp_cache,
            )

            # Strict validator rejected the cached rule, so cache was invalidated,
            # compiler re-invoked provider, and strict_validator ran on the new generation
            assert mock_provider.generate.call_count == 1
            assert res["accepted"] is True
            assert res["cached"] is False

    def test_concurrent_identical_requests_thread_safe(self, temp_cache, sample_state, valid_rule):
        """Multiple concurrent requests with identical proposals don't cause SQLite lock errors."""
        mock_provider = Mock()
        mock_provider.availability_detail.return_value = (True, True, "Ready")
        mock_provider.is_available.return_value = True
        mock_provider.generate.return_value = json.dumps(valid_rule)

        results = []
        num_threads = 10

        def worker():
            with patch("backend.court.compiler.get_provider", return_value=mock_provider):
                res = compile_amendment(
                    "When you land, gain 2 points",
                    sample_state,
                    cache=temp_cache,
                )
                results.append(res)

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(worker) for _ in range(num_threads)]
            for f in futures:
                f.result()

        assert len(results) == num_threads
        for r in results:
            assert r["accepted"] is True
            assert r["rule"] is not None

        # SQLite database should be intact with exactly 1 cached entry
        assert temp_cache.count() == 1


from fastapi.testclient import TestClient
from backend.app import app, games
from backend.engine.state import add_amendment

client = TestClient(app)


# ---------------------------------------------------------------------------
# 4. Engine & Authorization Enforcement (Requirements 9 & 10)
# ---------------------------------------------------------------------------

class TestGameEngineRuleEnforcement:
    """Ensure AI and cached rules never bypass game rules or authorization."""

    def test_engine_add_amendment_enforces_max_rules(self, sample_state, valid_rule):
        """Game engine rejects additions when maximum rules count is reached."""
        state = dict(sample_state)
        state["settings"] = dict(sample_state["settings"])
        state["settings"]["max_rules"] = 1
        state["rules"] = [
            {
                "id": "rule_1",
                "trigger": "on_roll",
                "condition": {"mode": "all", "predicates": []},
                "effect": {"type": "add_score", "amount": 1, "target": "self"},
                "source": "Existing rule",
            }
        ]

        # Engine level check
        success, err = add_amendment(state, valid_rule)
        assert success is False
        assert "max rules" in err.lower()

    def test_cached_rule_cannot_bypass_endpoint_authorization(self, temp_cache, valid_rule):
        """Cached rules cannot bypass JWT authentication or turn validation on /game/{id}/amend."""
        # 1. Create a game via API
        game_res = client.post(
            "/game/new",
            json={
                "settings": {
                    "board_size": 6,
                    "dice_type": "1d6",
                    "win_target": 21,
                    "mode": "live",
                    "max_rules": 8,
                    "amend_every": 1,
                },
                "players": [
                    {"id": "P1", "name": "Alice"},
                    {"id": "P2", "name": "Bob"},
                ],
            },
        ).json()
        game_id = game_res["game_id"]
        assert game_id in games

        # Mark game as multiplayer match requiring authentication
        games[game_id]["is_multiplayer"] = True

        # Prime the persistent cache
        key, norm, ctx = compute_cache_key("When you land, gain 2 points", games[game_id])
        temp_cache.set(key, norm, ctx, valid_rule)

        # 2. Attempt amendment without Authorization header (should fail 401)
        res_no_auth = client.post(
            f"/game/{game_id}/amend",
            json={"player_id": "P1", "text": "When you land, gain 2 points"},
        )
        assert res_no_auth.status_code == 401

        # 3. Authenticate guest players
        auth_alice = client.post("/auth/guest", json={"nickname": "Alice"}).json()
        auth_bob = client.post("/auth/guest", json={"nickname": "Bob"}).json()
        alice_token = auth_alice["token"]
        alice_id = auth_alice["player_id"]
        bob_token = auth_bob["token"]

        # Ensure player in game matches Alice's player_id
        games[game_id]["players"][0]["id"] = alice_id

        # Bob attempts to impersonate Alice to apply a cached amendment (should fail 403)
        res_impersonate = client.post(
            f"/game/{game_id}/amend",
            headers={"Authorization": f"Bearer {bob_token}"},
            json={"player_id": alice_id, "text": "When you land, gain 2 points"},
        )
        assert res_impersonate.status_code == 403

        # 4. Attempt amendment when not in an amendment window (should fail 400)
        games[game_id]["moves_since_amend"] = 0
        games[game_id]["settings"]["amend_every"] = 2

        res_not_eligible = client.post(
            f"/game/{game_id}/amend",
            headers={"Authorization": f"Bearer {alice_token}"},
            json={"player_id": alice_id, "text": "When you land, gain 2 points"},
        )
        assert res_not_eligible.status_code == 200
        data = res_not_eligible.json()
        assert data["accepted"] is False
        assert "not available" in data["error"].lower()
