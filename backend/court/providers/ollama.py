"""
Ollama provider for local LLM inference.

Connects to a local Ollama server running on http://localhost:11434 (configurable).
"""

import json
import requests
from typing import Optional, Dict, Any, Tuple

from backend.court.providers.base import (
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError,
    ProviderModelNotFoundError,
)


def _normalize_model_name(name: str) -> str:
    """Return model name with an explicit ':latest' tag if no tag is present."""
    return name if ":" in name else f"{name}:latest"


def _model_matches(configured: str, installed: str) -> bool:
    """
    Return True if 'installed' satisfies 'configured'.

    Rules (case-insensitive):
    - Exact match after lowercasing.
    - If configured has no tag (e.g. 'gemma3'), treat it as 'gemma3:latest'
      and check against installed name exactly or 'gemma3:latest'.
    No loose prefix matching that could accidentally match a different size.
    """
    c = configured.lower()
    i = installed.lower()
    if c == i:
        return True
    # If configured has no tag, compare with its ':latest' expansion
    if ":" not in c:
        return i == f"{c}:latest"
    return False


class OllamaProvider(LLMProvider):
    """
    Provider for local Ollama inference server.

    Supports structured output via the 'format' parameter when available.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: int = 30,
        temperature: float = 0.0,
        seed: int = 42,
        num_ctx: int = 4096,
        keep_alive: str = "30m",
        num_predict: int = 512,
    ):
        """
        Initialize Ollama provider.

        Args:
            base_url: Ollama server URL (e.g., "http://localhost:11434")
            model: Model name (e.g., "gemma3:4b")
            timeout: Request timeout in seconds
            temperature: Sampling temperature
            seed: Random seed for reproducibility
            num_ctx: Context window size
            keep_alive: How long to keep model loaded (e.g. "30m")
            num_predict: Max tokens to generate
        """
        super().__init__(model=model, timeout=timeout, temperature=temperature)
        self.base_url = base_url.rstrip("/")
        self.generate_url = f"{self.base_url}/api/generate"
        self.tags_url = f"{self.base_url}/api/tags"
        self.seed = seed
        self.num_ctx = num_ctx
        self.keep_alive = keep_alive
        self.num_predict = num_predict

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Generate a response from Ollama.

        Args:
            prompt: The user prompt
            system_prompt: Optional system instructions
            json_schema: Optional JSON schema for structured output

        Returns:
            Generated text response

        Raises:
            ProviderTimeoutError: If request times out
            ProviderConnectionError: If cannot connect to Ollama
            ProviderModelNotFoundError: If model is not installed
            ProviderError: For other errors
        """
        # Build the full prompt
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{prompt}"

        # Build request payload
        payload: Dict[str, Any] = {
            "model": self.model,
            "prompt": full_prompt,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {
                "temperature": self.temperature,
                "seed": self.seed,
                "num_ctx": self.num_ctx,
                "num_predict": self.num_predict,
            },
        }

        # Add JSON schema if provided (Ollama's structured output)
        if json_schema is not None:
            payload["format"] = json_schema

        try:
            response = requests.post(
                self.generate_url,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()

            return data.get("response", "").strip()

        except requests.exceptions.Timeout:
            raise ProviderTimeoutError(
                f"Ollama request timed out after {self.timeout} seconds"
            )
        except requests.exceptions.ConnectionError as e:
            raise ProviderConnectionError(
                f"Could not connect to Ollama at {self.base_url}. "
                f"Make sure Ollama is running: ollama serve. Error: {e}"
            )
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                raise ProviderModelNotFoundError(
                    f"Model '{self.model}' not found. "
                    f"Install with: ollama pull {self.model}"
                )
            raise ProviderError(
                f"Ollama HTTP error {e.response.status_code if e.response is not None else '?'}: "
                f"{e.response.text if e.response is not None else str(e)}"
            )
        except Exception as e:
            raise ProviderError(f"Unexpected Ollama error: {e}")

    def is_available(self) -> bool:
        """
        Check if Ollama server is available and the configured model is installed.

        Uses normalized name matching (case-insensitive; bare name matches ':latest').

        Returns:
            True if Ollama is reachable and a matching model is installed.
        """
        reachable, model_ok, _ = self.availability_detail()
        return reachable and model_ok

    def availability_detail(self) -> Tuple[bool, bool, str]:
        """
        Return detailed availability information.

        Returns:
            (ollama_reachable, model_installed, message)
        """
        try:
            response = requests.get(self.tags_url, timeout=5)
            response.raise_for_status()
        except requests.exceptions.ConnectionError:
            return (
                False,
                False,
                "Ollama is not running. Start it with: ollama serve",
            )
        except Exception as e:
            return False, False, f"Cannot reach Ollama: {e}"

        data = response.json()
        installed_names = [m["name"] for m in data.get("models", [])]
        for name in installed_names:
            if _model_matches(self.model, name):
                return True, True, f"Model '{self.model}' is ready."

        pull_name = _normalize_model_name(self.model)
        return (
            True,
            False,
            f"Model '{self.model}' is not installed. "
            f"Run: ollama pull {pull_name}",
        )

    def _list_models(self) -> list[str]:
        """List available Ollama models."""
        try:
            response = requests.get(self.tags_url, timeout=5)
            response.raise_for_status()
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        except Exception:
            return []
