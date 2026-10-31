"""
Gemini provider for hosted Google AI inference.

WARNING: This provider is NOT used by default.
AMENDMENT is a local-first game: all AI evaluation runs locally on your machine
using Ollama. This provider is a placeholder that is only activated when
COURT_PROVIDER=gemini is explicitly configured, and would send prompt and game
data to Google's hosted service.
"""

from typing import Optional, Dict, Any, Tuple
import requests

from backend.court.providers.base import (
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError,
    ProviderModelNotFoundError,
    ProviderRateLimitError,
    ProviderAuthError,
    ProviderPermissionError,
    ProviderInvalidRequestError,
    ProviderServerError,
)


class GeminiProvider(LLMProvider):
    """
    Provider for Google's Gemini API via REST.
    Activated when COURT_PRIMARY_PROVIDER=gemini or COURT_PROVIDER=gemini is configured.
    """

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
        timeout: int = 15,
        temperature: float = 0.0,
    ):
        super().__init__(model=model, timeout=timeout, temperature=temperature)
        self.api_key = api_key

        if not self.api_key:
            raise ValueError("Gemini API key is required but not provided")

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate a response from Gemini using the Generative Language REST API.
        Passes authentication securely via the x-goog-api-key header.
        """
        url = f"{self.BASE_URL}/{self.model}:generateContent"

        payload: Dict[str, Any] = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": self.temperature,
            },
        }

        if system_prompt:
            payload["systemInstruction"] = {
                "parts": [{"text": system_prompt}]
            }

        # Request JSON output if structured output is desired
        if json_schema is not None:
            payload["generationConfig"]["responseMimeType"] = "application/json"

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }

        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as e:
            raise ProviderTimeoutError(f"Gemini API request timed out: {e}")
        except requests.exceptions.ConnectionError as e:
            raise ProviderConnectionError(f"Could not connect to Gemini API: {e}")
        except Exception as e:
            raise ProviderError(f"Unexpected error connecting to Gemini API: {e}")

        raw_text = response.text or ""
        scrubbed_text = raw_text.replace(self.api_key, "[REDACTED]")

        # Error classification
        if response.status_code == 429:
            retry_header = response.headers.get("Retry-After") or response.headers.get("retry-after")
            retry_sec = None
            if retry_header and str(retry_header).isdigit():
                retry_sec = int(retry_header)
            is_daily = any(
                phrase in scrubbed_text.lower()
                for phrase in ("per day", "daily", "freetierperday", "quota exceeded", "resource_exhausted")
            )
            raise ProviderRateLimitError(
                f"Gemini API rate limit exceeded (HTTP 429): {scrubbed_text}",
                is_daily_quota=is_daily,
                retry_after=retry_sec,
            )
        elif response.status_code == 401:
            raise ProviderAuthError(
                "Gemini API authentication failed (HTTP 401). Please verify GEMINI_API_KEY."
            )
        elif response.status_code == 403:
            raise ProviderPermissionError(
                f"Gemini API permission denied (HTTP 403): {scrubbed_text}"
            )
        elif response.status_code == 400:
            raise ProviderInvalidRequestError(
                f"Gemini API bad request (HTTP 400): {scrubbed_text}"
            )
        elif response.status_code == 404:
            raise ProviderModelNotFoundError(
                f"Gemini model '{self.model}' not found (HTTP 404): {scrubbed_text}"
            )
        elif response.status_code >= 500:
            raise ProviderServerError(
                f"Gemini API server error (HTTP {response.status_code}): {scrubbed_text}"
            )
        elif response.status_code != 200:
            raise ProviderError(
                f"Gemini API returned status {response.status_code}: {scrubbed_text}"
            )

        try:
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise ProviderError(f"Gemini returned no candidates: {data}")

            parts = candidates[0].get("content", {}).get("parts", [])
            if not parts or "text" not in parts[0]:
                raise ProviderError(f"Gemini response missing text: {data}")

            return parts[0]["text"]
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(f"Failed to parse Gemini response: {e}")

    def is_available(self) -> bool:
        """Check if Gemini API is available."""
        return bool(self.api_key)

    def availability_detail(self) -> Tuple[bool, bool, str]:
        """Detailed status for court availability check."""
        if not self.api_key:
            return False, False, "GEMINI_API_KEY environment variable is missing"
        return True, True, "Gemini provider is configured and ready"

    def __repr__(self) -> str:
        # Never expose or log the api_key
        return f"GeminiProvider(model={self.model}, api_key=***, timeout={self.timeout}s)"

