"""
Tests for AMENDMENT Dual-Provider Fallback System (Gemini Primary, Groq Secondary)
and SQLite Persistent Rule Cache Integration.

Requirements covered:
1. Preserve both Gemini and Groq providers and persistent SQLite rule cache.
2. Configurable provider priority (Primary: Gemini, Secondary: Groq).
3. Cache checked before any external API request.
4. On cache miss, primary provider tried first.
5. On HTTP 429 rate limit, secondary provider (Groq) attempted as fallback without retry loop.
6. Transient failures (timeouts, connection errors, HTTP 5xx) fall back with bounded retries.
7. No fallback on invalid API keys (401), permissions (403), or malformed client requests (400).
8. Quota exhaustion vs temporary rate limit detection without retry loops.
9. Inspect error details on 429.
10. Schema and deterministic game-engine validation on all outputs.
11. One bounded fallback attempt on malformed output; never apply unvalidated output.
12. Cache only successful, fully validated results with context and model/compiler metadata.
13. Prevent duplicate concurrent identical provider calls (Single-Flight request coalescing).
14. Never expose or log API keys; authenticate Gemini via x-goog-api-key header.
15. Verify configuration variables.
16. Authoritative turn and engine validation.
"""

import json
import os
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests

from backend.court.cache import RuleCache, compute_cache_key
from backend.court.compiler import compile_amendment
from backend.court.config import CourtConfig
from backend.court.providers.base import (
    ProviderAuthError,
    ProviderConnectionError,
    ProviderInvalidRequestError,
    ProviderPermissionError,
    ProviderRateLimitError,
    ProviderServerError,
    ProviderTimeoutError,
)
from backend.court.providers.gemini import GeminiProvider
from backend.court.providers.groq import GroqProvider
from backend.engine.state import create_game
from backend.engine.validate import validate_rule


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_cache():
    """Create an isolated temporary SQLite RuleCache instance."""
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
def valid_rule_payload():
    """Canonical valid rule dict."""
    return {
        "trigger": "on_land",
        "condition": {"mode": "all", "predicates": []},
        "effect": {"type": "add_score", "amount": 2, "target": "self"},
        "source": "When you land, gain 2 points",
    }


# ---------------------------------------------------------------------------
# 1. Gemini Security & Header Authentication Tests (Requirement 14)
# ---------------------------------------------------------------------------

class TestGeminiProviderSecurity:
    """Tests verifying Gemini provider security and header-based authentication."""

    def test_gemini_uses_header_auth_not_url_query_param(self):
        """API key must be transmitted in x-goog-api-key header, never in URL query string."""
        secret_key = "AIzaSyTestSecretKey_NeverExpose"
        provider = GeminiProvider(api_key=secret_key, model="gemini-2.0-flash")

        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "candidates": [{
                    "content": {
                        "parts": [{"text": '{"trigger":"on_land","condition":{"mode":"all","predicates":[]},"effect":{"type":"add_score","amount":2,"target":"self"}}'}]
                    }
                }]
            }
            mock_post.return_value = mock_resp

            provider.generate(prompt="test", system_prompt="system")

            assert mock_post.called
            call_url = mock_post.call_args[0][0]
            call_headers = mock_post.call_args[1].get("headers", {})

            # Key must NOT be in URL
            assert secret_key not in call_url
            assert "key=" not in call_url

            # Key MUST be in x-goog-api-key header
            assert call_headers.get("x-goog-api-key") == secret_key

    def test_gemini_repr_and_str_mask_api_key(self):
        """String representation of GeminiProvider must mask the secret key."""
        secret_key = "AIzaSyRealSecretKey123456789"
        provider = GeminiProvider(api_key=secret_key, model="gemini-2.0-flash")

        assert secret_key not in repr(provider)
        assert secret_key not in str(provider)
        assert "***" in repr(provider)


# ---------------------------------------------------------------------------
# 2. Provider Error Classification Tests (Requirements 5, 7, 8, 9)
# ---------------------------------------------------------------------------

class TestProviderClassification:
    """Verify HTTP status code mappings for both Gemini and Groq."""

    def test_gemini_rate_limit_per_minute(self):
        """HTTP 429 with standard rate limit maps to ProviderRateLimitError(is_daily_quota=False)."""
        provider = GeminiProvider(api_key="test-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 429
            mock_resp.headers = {"Retry-After": "10"}
            mock_resp.text = json.dumps({"error": {"message": "Rate limit exceeded. Please slow down."}})
            mock_resp.json.return_value = {"error": {"message": "Rate limit exceeded."}}
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderRateLimitError) as exc_info:
                provider.generate("test")

            assert not exc_info.value.is_daily_quota
            assert exc_info.value.retry_after == 10

    def test_gemini_daily_quota_exhaustion_detected(self):
        """HTTP 429 with daily quota/RESOURCE_EXHAUSTED maps to is_daily_quota=True."""
        provider = GeminiProvider(api_key="test-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 429
            mock_resp.headers = {}
            mock_resp.text = json.dumps({
                "error": {
                    "code": 429,
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "Quota exceeded for quota metric 'GenerateContent requests per day' exceeded."
                }
            })
            mock_resp.json.return_value = json.loads(mock_resp.text)
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderRateLimitError) as exc_info:
                provider.generate("test")

            assert exc_info.value.is_daily_quota

    def test_gemini_auth_error_401(self):
        """HTTP 401 raises ProviderAuthError."""
        provider = GeminiProvider(api_key="bad-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 401
            mock_resp.text = json.dumps({"error": {"message": "API key not valid."}})
            mock_resp.json.return_value = {"error": {"message": "API key not valid."}}
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderAuthError):
                provider.generate("test")

    def test_gemini_permission_error_403(self):
        """HTTP 403 raises ProviderPermissionError."""
        provider = GeminiProvider(api_key="forbidden-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 403
            mock_resp.text = json.dumps({"error": {"message": "Caller does not have permission."}})
            mock_resp.json.return_value = {"error": {"message": "Caller does not have permission."}}
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderPermissionError):
                provider.generate("test")

    def test_gemini_invalid_request_400(self):
        """HTTP 400 raises ProviderInvalidRequestError."""
        provider = GeminiProvider(api_key="test-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 400
            mock_resp.text = json.dumps({"error": {"message": "Field 'contents' is missing."}})
            mock_resp.json.return_value = {"error": {"message": "Field 'contents' is missing."}}
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderInvalidRequestError):
                provider.generate("test")

    def test_gemini_server_error_500(self):
        """HTTP 500 raises ProviderServerError."""
        provider = GeminiProvider(api_key="test-key")
        with patch("requests.post") as mock_post:
            mock_resp = Mock()
            mock_resp.status_code = 500
            mock_resp.text = "Internal Server Error"
            mock_post.return_value = mock_resp

            with pytest.raises(ProviderServerError):
                provider.generate("test")

    def test_groq_rate_limit_and_server_error(self):
        """Groq provider maps 429, 401, 403, and 500 to appropriate exception types."""
        provider = GroqProvider(api_key="test-groq-key")
        with patch("requests.post") as mock_post:
            # 429
            mock_resp = Mock()
            mock_resp.status_code = 429
            mock_resp.headers = {"retry-after": "5"}
            mock_resp.text = json.dumps({"error": {"message": "Rate limit reached."}})
            mock_resp.json.return_value = json.loads(mock_resp.text)
            mock_post.return_value = mock_resp
            with pytest.raises(ProviderRateLimitError):
                provider.generate("test")

            # 401
            mock_resp.status_code = 401
            mock_resp.text = json.dumps({"error": {"message": "Invalid API key"}})
            mock_resp.json.return_value = json.loads(mock_resp.text)
            with pytest.raises(ProviderAuthError):
                provider.generate("test")

            # 403
            mock_resp.status_code = 403
            mock_resp.text = json.dumps({"error": {"message": "Access denied"}})
            mock_resp.json.return_value = json.loads(mock_resp.text)
            with pytest.raises(ProviderPermissionError):
                provider.generate("test")

            # 503
            mock_resp.status_code = 503
            mock_resp.text = "Service Unavailable"
            with pytest.raises(ProviderServerError):
                provider.generate("test")


# ---------------------------------------------------------------------------
# 3. Dual-Provider Fallback Compiler Tests (Requirements 1-13)
# ---------------------------------------------------------------------------

class TestDualProviderFallbackCompiler:
    """Comprehensive tests for compiler dual-provider execution, caching, and fallback."""

    def test_primary_success_groq_not_called(self, temp_cache, sample_state, valid_rule_payload):
        """When primary (Gemini) succeeds, secondary (Groq) is never called, and result is cached."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.return_value = json.dumps(valid_rule_payload)

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is True
        assert result["rule"]["effect"]["amount"] == 2
        assert result["cached"] is False
        assert result.get("fallback_used") is not True

        # Primary called once, fallback never called
        assert primary.generate.call_count == 1
        assert fallback.generate.call_count == 0

        # Result is now stored in SQLite cache
        cache_key, _, _ = compute_cache_key("When you land, gain 2 points", sample_state)
        cached_entry = temp_cache.get(cache_key)
        assert cached_entry is not None
        assert cached_entry["effect"]["amount"] == 2

    def test_cache_hit_before_any_external_call(self, temp_cache, sample_state, valid_rule_payload):
        """Rule cache hit resolves before any external API request is dispatched."""
        # Pre-populate cache
        cache_key, norm_text, context = compute_cache_key("When you land, gain 2 points", sample_state)
        temp_cache.set(cache_key, norm_text, context, valid_rule_payload)

        primary = Mock()
        fallback = Mock()

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is True
        assert result["cached"] is True
        assert result["rule"]["effect"]["amount"] == 2

        # Neither provider called
        assert primary.generate.call_count == 0
        assert fallback.generate.call_count == 0

    def test_primary_429_rate_limit_falls_back_to_groq_without_retry_loop(
        self, temp_cache, sample_state, valid_rule_payload
    ):
        """When Gemini returns HTTP 429, fall back to Groq immediately without retry loop."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderRateLimitError("429 Rate limit exceeded", is_daily_quota=False)

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(valid_rule_payload)

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is True
        assert result["fallback_used"] is True
        assert result["rule"]["effect"]["amount"] == 2

        # Primary failed once on 429 and was NOT retried
        assert primary.generate.call_count == 1
        # Fallback called once and succeeded
        assert fallback.generate.call_count == 1

        # Successfully validated rule saved to persistent cache
        cache_key, _, _ = compute_cache_key("When you land, gain 2 points", sample_state)
        assert temp_cache.get(cache_key) is not None

    def test_primary_daily_quota_exhausted_falls_back_to_groq(
        self, temp_cache, sample_state, valid_rule_payload
    ):
        """When Gemini has exhausted daily quota, immediately fall back to Groq."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderRateLimitError(
            "Daily quota exceeded for Gemini API", is_daily_quota=True
        )

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(valid_rule_payload)

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is True
        assert result["fallback_used"] is True
        assert primary.generate.call_count == 1
        assert fallback.generate.call_count == 1

    def test_primary_timeout_falls_back_to_groq(self, temp_cache, sample_state, valid_rule_payload):
        """Transient timeout on primary provider falls back to secondary provider."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderTimeoutError("Connection timed out after 15s")

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(valid_rule_payload)

        with patch("backend.court.compiler.CourtConfig.MAX_RETRIES", 1):
            result = compile_amendment(
                text="When you land, gain 2 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )

        assert result["accepted"] is True
        assert result["fallback_used"] is True
        assert fallback.generate.call_count == 1

    def test_primary_connection_error_and_server_error_fall_back(
        self, temp_cache, sample_state, valid_rule_payload
    ):
        """Transient connection and 5xx errors on primary fall back to secondary."""
        # Connection error
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderConnectionError("Failed to establish a new connection")

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(valid_rule_payload)

        with patch("backend.court.compiler.CourtConfig.MAX_RETRIES", 0):
            result = compile_amendment(
                text="When you land, gain 2 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )

        assert result["accepted"] is True
        assert result["fallback_used"] is True

        # Server error (500)
        primary.generate.side_effect = ProviderServerError("500 Internal Server Error")
        cache_key, _, _ = compute_cache_key("When you land, gain 2 points", sample_state)
        temp_cache.invalidate(cache_key)
        with patch("backend.court.compiler.CourtConfig.MAX_RETRIES", 0):
            result2 = compile_amendment(
                text="When you land, gain 2 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )
        assert result2["accepted"] is True
        assert result2["fallback_used"] is True

    def test_primary_malformed_output_falls_back_bounded(
        self, temp_cache, sample_state, valid_rule_payload
    ):
        """Primary returns unparseable markdown/gibberish -> fallback succeeds with 1 bounded attempt."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.return_value = "Sorry, here is some non-JSON unstructured text that cannot be parsed."

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(valid_rule_payload)

        with patch("backend.court.compiler.CourtConfig.MAX_RETRIES", 0):
            result = compile_amendment(
                text="When you land, gain 2 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )

        assert result["accepted"] is True
        assert result["fallback_used"] is True
        assert result["rule"]["effect"]["amount"] == 2

    def test_no_fallback_on_invalid_credentials_401(self, temp_cache, sample_state):
        """Invalid API key (401) on primary must NOT fall back; return actionable error immediately."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderAuthError("Invalid Gemini API key provided")

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is False
        assert "Invalid Gemini API key" in result["error"]
        # Fallback was NOT attempted
        assert fallback.generate.call_count == 0

        # Nothing saved to cache
        cache_key, _, _ = compute_cache_key("When you land, gain 2 points", sample_state)
        assert temp_cache.get(cache_key) is None

    def test_no_fallback_on_permission_error_403(self, temp_cache, sample_state):
        """Permission error (403) on primary must NOT fall back."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderPermissionError("Caller does not have permission")

        fallback = Mock()

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is False
        assert fallback.generate.call_count == 0

    def test_no_fallback_on_malformed_client_request_400(self, temp_cache, sample_state):
        """Malformed client request (400) on primary must NOT fall back."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderInvalidRequestError("Invalid argument in request payload")

        fallback = Mock()

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is False
        assert fallback.generate.call_count == 0

    def test_both_providers_fail_returns_actionable_composite_error(
        self, temp_cache, sample_state
    ):
        """When primary rate limits and fallback server errors, return clean composite error."""
        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = ProviderRateLimitError("Gemini 429 rate limit")

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.side_effect = ProviderServerError("Groq 500 server error")

        result = compile_amendment(
            text="When you land, gain 2 points",
            state=sample_state,
            validate_rule_fn=validate_rule,
            cache=temp_cache,
            provider=primary,
            fallback_provider=fallback,
        )

        assert result["accepted"] is False
        assert "Primary provider (gemini-2.0-flash) failed" in result["error"]
        assert "Fallback provider (llama-3.3-70b-versatile) failed" in result["error"]

        # Cache remains empty
        cache_key, _, _ = compute_cache_key("When you land, gain 2 points", sample_state)
        assert temp_cache.get(cache_key) is None

    def test_single_flight_coalesces_concurrent_identical_requests(
        self, temp_cache, sample_state, valid_rule_payload
    ):
        """Concurrent identical requests coalesce so primary provider is called only once."""
        call_count = 0
        lock = threading.Lock()

        def slow_generate(*args, **kwargs):
            nonlocal call_count
            with lock:
                call_count += 1
            import time
            time.sleep(0.05)
            return json.dumps(valid_rule_payload)

        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.side_effect = slow_generate

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True

        def run_compilation():
            return compile_amendment(
                text="When you land, gain 2 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(run_compilation) for _ in range(5)]
            results = [f.result() for f in futures]

        # All 5 requests must succeed
        for res in results:
            assert res["accepted"] is True
            assert res["rule"]["effect"]["amount"] == 2

        # Primary provider was called only ONCE due to single-flight coalescing
        assert call_count == 1
        assert fallback.generate.call_count == 0


# ---------------------------------------------------------------------------
# 4. Engine & Turn Validation Integrity Tests (Requirement 10, 16)
# ---------------------------------------------------------------------------

class TestEngineTurnValidationIntegrity:
    """Ensure authoritative engine rules and turn validation cannot be bypassed via Court."""

    def test_invalid_rule_rejected_by_engine_validation_not_cached(
        self, temp_cache, sample_state
    ):
        """If provider outputs an invalid effect amount, engine rejects it and nothing is cached."""
        # Amount 99 is invalid under standard game rules
        invalid_rule = {
            "trigger": "on_land",
            "condition": {"mode": "all", "predicates": []},
            "effect": {"type": "add_score", "amount": 99, "target": "self"},
            "source": "When you land, gain 99 points",
        }

        primary = Mock()
        primary.model = "gemini-2.0-flash"
        primary.is_available.return_value = True
        primary.generate.return_value = json.dumps(invalid_rule)

        fallback = Mock()
        fallback.model = "llama-3.3-70b-versatile"
        fallback.is_available.return_value = True
        fallback.generate.return_value = json.dumps(invalid_rule)

        with patch("backend.court.compiler.CourtConfig.MAX_RETRIES", 0):
            result = compile_amendment(
                text="When you land, gain 99 points",
                state=sample_state,
                validate_rule_fn=validate_rule,
                cache=temp_cache,
                provider=primary,
                fallback_provider=fallback,
            )

        assert result["accepted"] is False
        assert result["rule"] is None

        # Verify nothing cached
        cache_key, _, _ = compute_cache_key("When you land, gain 99 points", sample_state)
        assert temp_cache.get(cache_key) is None
