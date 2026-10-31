"""
Base provider interface for LLM providers.

All providers must implement the LLMProvider abstract class.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any


class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class ProviderTimeoutError(ProviderError):
    """Raised when a provider request times out."""
    pass


class ProviderConnectionError(ProviderError):
    """Raised when unable to connect to the provider."""
    pass


class ProviderModelNotFoundError(ProviderError):
    """Raised when the configured model is not installed."""
    pass


class ProviderRateLimitError(ProviderError):
    """Raised when a provider returns HTTP 429 rate limit exceeded."""
    def __init__(self, message: str, is_daily_quota: bool = False, retry_after: Optional[int] = None):
        super().__init__(message)
        self.is_daily_quota = is_daily_quota
        self.retry_after = retry_after


class ProviderAuthError(ProviderError):
    """Raised when a provider returns HTTP 401 authentication failure."""
    pass


class ProviderPermissionError(ProviderError):
    """Raised when a provider returns HTTP 403 permission or access denied."""
    pass


class ProviderInvalidRequestError(ProviderError):
    """Raised when a provider returns HTTP 400 bad/malformed request."""
    pass


class ProviderServerError(ProviderError):
    """Raised when a provider returns HTTP 5xx internal server error."""
    pass


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    All providers must implement the generate method with consistent behavior:
    - Handle timeouts gracefully
    - Return clean text responses
    - Raise specific exceptions for different error types
    """
    
    def __init__(self, model: str, timeout: int, temperature: float):
        """
        Initialize the provider.
        
        Args:
            model: Model identifier (e.g., "gemma3:4b", "gemini-2.0-flash-exp")
            timeout: Request timeout in seconds
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative)
        """
        self.model = model
        self.timeout = timeout
        self.temperature = temperature
    
    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a response from the LLM.
        
        Args:
            prompt: The user prompt/query
            system_prompt: Optional system instructions
            json_schema: Optional JSON schema for structured output
            
        Returns:
            The generated text response
            
        Raises:
            ProviderTimeoutError: If request exceeds timeout
            ProviderConnectionError: If unable to connect to provider
            ProviderError: For other provider-specific errors
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """
        Check if the provider is available and responding.
        
        Returns:
            True if provider is reachable, False otherwise
        """
        pass
    
    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model={self.model}, timeout={self.timeout}s)"
