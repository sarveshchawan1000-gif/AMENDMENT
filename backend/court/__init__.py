"""
AMENDMENT Court - AI-powered rule compiler and judge.

The Court transforms plain English amendments into validated JSON rules.
"""

from backend.court.providers import get_provider, LLMProvider
from backend.court.compiler import compile_amendment

__all__ = ["get_provider", "LLMProvider", "compile_amendment"]
