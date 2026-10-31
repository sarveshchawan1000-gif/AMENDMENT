"""
Groq provider for hosted fast AI inference.

Implements the official Groq REST API (OpenAI-compatible chat completions)
with structured JSON response format support.
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


class GroqProvider(LLMProvider):
    """
    Provider for Groq's high-speed inference API.
    Activated when COURT_PROVIDER=groq or COURT_FALLBACK_PROVIDER=groq is configured.
    """

    BASE_URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(
        self,
        api_key: str,
        model: str = "llama-3.3-70b-versatile",
        timeout: int = 15,
        temperature: float = 0.0,
    ):
        super().__init__(model=model, timeout=timeout, temperature=temperature)
        self.api_key = api_key

        if not self.api_key:
            raise ValueError("Groq API key is required but not provided")

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate a response from Groq using the chat completions REST API.
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
        }

        # Request JSON output if structured output is desired
        if json_schema is not None:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                self.BASE_URL,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as e:
            raise ProviderTimeoutError(f"Groq API request timed out: {e}")
        except requests.exceptions.ConnectionError as e:
            raise ProviderConnectionError(f"Could not connect to Groq API: {e}")
        except Exception as e:
            raise ProviderError(f"Unexpected error connecting to Groq API: {e}")

        raw_text = response.text or ""
        scrubbed_text = raw_text.replace(self.api_key, "[REDACTED]")

        # Handle specific HTTP error status codes
        if response.status_code == 429:
            retry_header = response.headers.get("Retry-After") or response.headers.get("retry-after")
            retry_sec = None
            if retry_header and str(retry_header).isdigit():
                retry_sec = int(retry_header)
            is_daily = any(
                phrase in scrubbed_text.lower()
                for phrase in ("per day", "daily", "quota exceeded", "resource_exhausted")
            )
            raise ProviderRateLimitError(
                f"Groq API rate limit exceeded (HTTP 429). Please wait a moment: {scrubbed_text}",
                is_daily_quota=is_daily,
                retry_after=retry_sec,
            )
        elif response.status_code == 401:
            raise ProviderAuthError(
                "Groq API authentication failed (HTTP 401). Please verify GROQ_API_KEY."
            )
        elif response.status_code == 403:
            raise ProviderPermissionError(
                f"Groq API permission denied (HTTP 403): {scrubbed_text}"
            )
        elif response.status_code == 400:
            raise ProviderInvalidRequestError(
                f"Groq API bad request (HTTP 400): {scrubbed_text}"
            )
        elif response.status_code == 404:
            raise ProviderModelNotFoundError(
                f"Groq model '{self.model}' not found (HTTP 404): {scrubbed_text}"
            )
        elif response.status_code >= 500:
            raise ProviderServerError(
                f"Groq API server error (HTTP {response.status_code}): {scrubbed_text}"
            )
        elif response.status_code != 200:
            raise ProviderError(
                f"Groq API returned status {response.status_code}: {scrubbed_text}"
            )

        try:
            data = response.json()
            choices = data.get("choices", [])
            if not choices:
                raise ProviderError(f"Groq returned no choices in response: {data}")

            message = choices[0].get("message", {})
            content = message.get("content")
            if not content:
                raise ProviderError(f"Groq response missing message content: {data}")

            return content.strip()
        except Exception as e:
            if isinstance(e, ProviderError):
                raise
            raise ProviderError(f"Failed to parse Groq response: {e}")

    def is_available(self) -> bool:
        """Check if Groq API is available (valid key configured)."""
        return bool(self.api_key)

    def availability_detail(self) -> Tuple[bool, bool, str]:
        """Detailed status for court availability check."""
        if not self.api_key:
            return False, False, "GROQ_API_KEY environment variable is missing"
        return True, True, "Groq provider is configured and ready"

    def __repr__(self) -> str:
        # Never expose or log the api_key
        return f"GroqProvider(model={self.model}, timeout={self.timeout}s)"
