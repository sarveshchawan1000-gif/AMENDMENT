"""
Configuration for the Court AI providers.

Reads from environment variables with sensible defaults.
The default and only supported provider for local play is Ollama.
Set COURT_PROVIDER=gemini only when deliberately using the hosted Google AI service.
"""

import os
from typing import Literal


ProviderType = Literal["ollama", "gemini"]


class CourtConfig:
    """Configuration for Court AI providers."""

    # Provider selection
    PROVIDER: ProviderType = os.getenv("COURT_PROVIDER", "ollama")  # type: ignore

    # Ollama settings
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma3:4b")
    OLLAMA_TIMEOUT: int = int(os.getenv("OLLAMA_TIMEOUT", "30"))

    # Ollama generation options (Task 4a)
    OLLAMA_SEED: int = int(os.getenv("OLLAMA_SEED", "42"))
    OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "4096"))
    OLLAMA_KEEP_ALIVE: str = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
    OLLAMA_NUM_PREDICT: int = int(os.getenv("OLLAMA_NUM_PREDICT", "512"))

    # Gemini settings (placeholder – not used by default)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    GEMINI_TIMEOUT: int = int(os.getenv("GEMINI_TIMEOUT", "15"))

    # Generation settings
    TEMPERATURE: float = float(os.getenv("COURT_TEMPERATURE", "0.0"))
    MAX_RETRIES: int = int(os.getenv("COURT_MAX_RETRIES", "1"))

    @classmethod
    def validate(cls) -> None:
        """Validate configuration and raise if invalid."""
        if cls.PROVIDER not in ("ollama", "gemini"):
            raise ValueError(
                f"Invalid COURT_PROVIDER: {cls.PROVIDER}. Must be 'ollama' or 'gemini'."
            )

        if cls.PROVIDER == "gemini" and not cls.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required when COURT_PROVIDER=gemini"
            )

        if cls.TEMPERATURE < 0 or cls.TEMPERATURE > 1:
            raise ValueError(
                f"COURT_TEMPERATURE must be between 0 and 1, got {cls.TEMPERATURE}"
            )


# Validate on import
CourtConfig.validate()
