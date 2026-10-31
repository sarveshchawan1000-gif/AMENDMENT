"""
Configuration for the Court AI providers.

Reads from environment variables with sensible defaults.
The default and only supported provider for local play is Ollama.
Set COURT_PROVIDER=gemini only when deliberately using the hosted Google AI service.
"""

import os
from typing import Literal


ProviderType = Literal["ollama", "gemini", "groq"]


class CourtConfig:
    """Configuration for Court AI providers."""

    # Primary and fallback provider selection
    PRIMARY_PROVIDER: str = (
        os.getenv("COURT_PRIMARY_PROVIDER")
        or os.getenv("COURT_PROVIDER", "ollama")
    ).lower()

    FALLBACK_PROVIDER: str = (
        os.getenv("COURT_FALLBACK_PROVIDER")
        or ("groq" if PRIMARY_PROVIDER == "gemini" and os.getenv("GROQ_API_KEY") else "")
    ).lower()

    # Backwards-compatible alias for single-provider references
    PROVIDER: ProviderType = PRIMARY_PROVIDER  # type: ignore

    # Ollama settings
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma3:4b")
    OLLAMA_TIMEOUT: int = int(os.getenv("OLLAMA_TIMEOUT", "30"))

    # Ollama generation options (Task 4a)
    OLLAMA_SEED: int = int(os.getenv("OLLAMA_SEED", "42"))
    OLLAMA_NUM_CTX: int = int(os.getenv("OLLAMA_NUM_CTX", "4096"))
    OLLAMA_KEEP_ALIVE: str = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
    OLLAMA_NUM_PREDICT: int = int(os.getenv("OLLAMA_NUM_PREDICT", "512"))

    # Gemini settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    GEMINI_TIMEOUT: int = int(os.getenv("GEMINI_TIMEOUT", "15"))

    # Groq settings (hosted fast LLM provider)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    GROQ_TIMEOUT: int = int(os.getenv("GROQ_TIMEOUT", "15"))

    # Generation settings
    TEMPERATURE: float = float(os.getenv("COURT_TEMPERATURE", "0.0"))
    MAX_RETRIES: int = int(os.getenv("COURT_MAX_RETRIES", "1"))

    @classmethod
    def validate(cls) -> None:
        """Validate configuration and raise if invalid."""
        primary = (cls.PRIMARY_PROVIDER or cls.PROVIDER).lower()
        if primary not in ("ollama", "gemini", "groq"):
            raise ValueError(
                f"Invalid primary COURT_PROVIDER: {primary}. Must be 'ollama', 'gemini', or 'groq'."
            )

        fallback = (cls.FALLBACK_PROVIDER or "").strip().lower()
        if fallback and fallback not in ("none", "ollama", "gemini", "groq"):
            raise ValueError(
                f"Invalid COURT_FALLBACK_PROVIDER: {fallback}. Must be 'ollama', 'gemini', 'groq', or 'none'."
            )

        if primary == "gemini" and not cls.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required when primary provider is gemini"
            )

        if primary == "groq" and not cls.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY environment variable is required when primary provider is groq"
            )

        if fallback == "gemini" and not cls.GEMINI_API_KEY:
            raise ValueError(
                "GEMINI_API_KEY environment variable is required when fallback provider is gemini"
            )

        if fallback == "groq" and not cls.GROQ_API_KEY:
            raise ValueError(
                "GROQ_API_KEY environment variable is required when fallback provider is groq"
            )

        if cls.TEMPERATURE < 0 or cls.TEMPERATURE > 1:
            raise ValueError(
                f"COURT_TEMPERATURE must be between 0 and 1, got {cls.TEMPERATURE}"
            )


# Validate on import
CourtConfig.validate()
