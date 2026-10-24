"""
Ollama provider for local LLM inference.

Connects to a local Ollama server running on http://localhost:11434 (configurable).
"""

import json
import requests
from typing import Optional, Dict, Any

from backend.court.providers.base import (
    LLMProvider,
    ProviderError,
    ProviderTimeoutError,
    ProviderConnectionError
)


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
        temperature: float = 0.0
    ):
        """
        Initialize Ollama provider.
        
        Args:
            base_url: Ollama server URL (e.g., "http://localhost:11434")
            model: Model name (e.g., "gemma2:2b")
            timeout: Request timeout in seconds
            temperature: Sampling temperature
        """
        super().__init__(model=model, timeout=timeout, temperature=temperature)
        self.base_url = base_url.rstrip("/")
        self.generate_url = f"{self.base_url}/api/generate"
        self.tags_url = f"{self.base_url}/api/tags"
    
    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None
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
            ProviderError: For other errors (model not found, etc.)
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
            "options": {
                "temperature": self.temperature,
            }
        }
        
        # Add JSON schema if provided (Ollama's structured output)
        if json_schema:
            payload["format"] = json_schema
        
        try:
            response = requests.post(
                self.generate_url,
                json=payload,
                timeout=self.timeout
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
                f"Make sure Ollama is running (ollama serve). Error: {e}"
            )
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                # Model not found - list available models
                available = self._list_models()
                model_list = ", ".join(available) if available else "none"
                raise ProviderError(
                    f"Model '{self.model}' not found. "
                    f"Available models: {model_list}. "
                    f"Install with: ollama pull {self.model}"
                )
            else:
                raise ProviderError(
                    f"Ollama HTTP error {e.response.status_code}: {e.response.text}"
                )
        except Exception as e:
            raise ProviderError(f"Unexpected Ollama error: {e}")
    
    def is_available(self) -> bool:
        """
        Check if Ollama server is available and the model exists.
        
        Returns:
            True if Ollama is reachable and model exists, False otherwise
        """
        try:
            # Quick health check - list models
            response = requests.get(self.tags_url, timeout=5)
            response.raise_for_status()
            
            # Check if our model is in the list
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            return self.model in models
            
        except Exception:
            return False
    
    def _list_models(self) -> list[str]:
        """
        List available Ollama models.
        
        Returns:
            List of model names, or empty list if unable to fetch
        """
        try:
            response = requests.get(self.tags_url, timeout=5)
            response.raise_for_status()
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        except Exception:
            return []
