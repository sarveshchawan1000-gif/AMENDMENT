"""
LLM providers for the Court.

Supports Ollama (local) and Gemini (hosted) with a unified interface.
"""

from backend.court.providers.base import (
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError
)
from backend.court.providers.ollama import OllamaProvider
from backend.court.config import CourtConfig


def get_provider() -> LLMProvider:
    """
    Factory function to get the configured LLM provider.
    
    Returns:
        LLMProvider instance based on COURT_PROVIDER env var
        
    Raises:
        ValueError: If provider type is not supported
    """
    provider_type = CourtConfig.PROVIDER
    
    if provider_type == "ollama":
        return OllamaProvider(
            base_url=CourtConfig.OLLAMA_URL,
            model=CourtConfig.OLLAMA_MODEL,
            timeout=CourtConfig.OLLAMA_TIMEOUT,
            temperature=CourtConfig.TEMPERATURE
        )
    elif provider_type == "gemini":
        # Import here to avoid requiring google-generativeai if not using Gemini
        from backend.court.providers.gemini import GeminiProvider
        return GeminiProvider(
            api_key=CourtConfig.GEMINI_API_KEY,
            model=CourtConfig.GEMINI_MODEL,
            timeout=CourtConfig.GEMINI_TIMEOUT,
            temperature=CourtConfig.TEMPERATURE
        )
    else:
        raise ValueError(f"Unsupported provider: {provider_type}")


__all__ = [
    "LLMProvider",
    "ProviderError",
    "ProviderTimeoutError",
    "ProviderConnectionError",
    "OllamaProvider",
    "get_provider",
]
