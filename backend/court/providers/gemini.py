"""
Gemini provider for hosted Google AI inference.

WARNING: This provider is NOT used by default.
AMENDMENT is a local-first game: all AI evaluation runs locally on your machine
using Ollama. This provider is a placeholder that is only activated when
COURT_PROVIDER=gemini is explicitly configured, and would send prompt and game
data to Google's hosted service.
"""

from typing import Optional, Dict, Any

from backend.court.providers.base import (
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError
)


class GeminiProvider(LLMProvider):
    """
    Provider for Google's Gemini API.
    
    TODO: Implement when deploying to production.
    This requires the google-generativeai package.
    """
    
    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: int = 15,
        temperature: float = 0.0
    ):
        """
        Initialize Gemini provider.
        
        Args:
            api_key: Google API key for Gemini
            model: Model name (e.g., "gemini-2.0-flash-exp")
            timeout: Request timeout in seconds
            temperature: Sampling temperature
        """
        super().__init__(model=model, timeout=timeout, temperature=temperature)
        self.api_key = api_key
        
        # Validate API key is provided
        if not self.api_key:
            raise ValueError("Gemini API key is required but not provided")
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a response from Gemini.
        
        TODO: Implement using google-generativeai SDK
        
        Args:
            prompt: The user prompt
            system_prompt: Optional system instructions
            json_schema: Optional JSON schema for structured output
            
        Returns:
            Generated text response
            
        Raises:
            NotImplementedError: Currently not implemented
        """
        raise NotImplementedError(
            "GeminiProvider is not yet implemented. "
            "This will be added when deploying to production."
        )
    
    def is_available(self) -> bool:
        """
        Check if Gemini API is available.
        
        TODO: Implement API health check
        
        Returns:
            False (not implemented yet)
        """
        return False
