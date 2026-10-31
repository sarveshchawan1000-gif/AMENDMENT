"""
LLM providers for the Court.

Supports Ollama (local) and Gemini (hosted) with a unified interface.
"""

from typing import Optional

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
from backend.court.providers.ollama import OllamaProvider
from backend.court.config import CourtConfig


def get_provider(provider_type: Optional[str] = None) -> LLMProvider:
    """
    Factory function to get an LLM provider.

    Args:
        provider_type: Optional provider name ('gemini', 'groq', 'ollama').
                       If None, defaults to CourtConfig.PRIMARY_PROVIDER or CourtConfig.PROVIDER.

    Returns:
        LLMProvider instance

    Raises:
        ValueError: If provider type is not supported
    """
    target = (
        provider_type
        or getattr(CourtConfig, "PRIMARY_PROVIDER", None)
        or getattr(CourtConfig, "PROVIDER", "ollama")
    ).lower()

    if target == "ollama":
        return OllamaProvider(
            base_url=CourtConfig.OLLAMA_URL,
            model=CourtConfig.OLLAMA_MODEL,
            timeout=CourtConfig.OLLAMA_TIMEOUT,
            temperature=CourtConfig.TEMPERATURE,
            seed=CourtConfig.OLLAMA_SEED,
            num_ctx=CourtConfig.OLLAMA_NUM_CTX,
            keep_alive=CourtConfig.OLLAMA_KEEP_ALIVE,
            num_predict=CourtConfig.OLLAMA_NUM_PREDICT,
        )
    elif target == "gemini":
        from backend.court.providers.gemini import GeminiProvider
        return GeminiProvider(
            api_key=CourtConfig.GEMINI_API_KEY,
            model=CourtConfig.GEMINI_MODEL,
            timeout=CourtConfig.GEMINI_TIMEOUT,
            temperature=CourtConfig.TEMPERATURE,
        )
    elif target == "groq":
        from backend.court.providers.groq import GroqProvider
        return GroqProvider(
            api_key=CourtConfig.GROQ_API_KEY,
            model=CourtConfig.GROQ_MODEL,
            timeout=CourtConfig.GROQ_TIMEOUT,
            temperature=CourtConfig.TEMPERATURE,
        )
    else:
        raise ValueError(f"Unsupported provider: {target}")


def get_fallback_provider() -> Optional[LLMProvider]:
    """
    Get the configured fallback LLM provider, or None if fallback is disabled.
    """
    fallback_type = getattr(CourtConfig, "FALLBACK_PROVIDER", "").strip().lower()
    if not fallback_type or fallback_type in ("none", CourtConfig.PRIMARY_PROVIDER.lower()):
        return None
    return get_provider(fallback_type)


__all__ = [
    "LLMProvider",
    "ProviderError",
    "ProviderTimeoutError",
    "ProviderConnectionError",
    "ProviderModelNotFoundError",
    "ProviderRateLimitError",
    "ProviderAuthError",
    "ProviderPermissionError",
    "ProviderInvalidRequestError",
    "ProviderServerError",
    "OllamaProvider",
    "GroqProvider",
    "get_provider",
    "get_fallback_provider",
]
