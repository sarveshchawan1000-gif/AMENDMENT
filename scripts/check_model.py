#!/usr/bin/env python3
"""
Check if the local Ollama server is running and test a model.
Usage: python scripts/check_model.py
Set OLLAMA_MODEL env var to test a specific model (default: gemma3:4b)
"""

import os
import sys
import time
import json
import requests
from typing import Dict, Any


try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from backend.court.config import CourtConfig
    DEFAULT_MODEL = CourtConfig.OLLAMA_MODEL
    OLLAMA_BASE_URL = CourtConfig.OLLAMA_URL
except Exception:
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
    DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:4b")


def list_installed_models() -> list[str]:
    """Fetch the list of installed models from Ollama."""
    try:
        response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        response.raise_for_status()
        data = response.json()
        return [model["name"] for model in data.get("models", [])]
    except requests.RequestException as e:
        print(f"❌ Could not list models: {e}")
        return []


def test_model(model_name: str) -> Dict[str, Any]:
    """
    Send a test prompt to the specified model and measure response time.
    Returns dict with: success (bool), response (str), time_ms (float), error (str)
    """
    result = {
        "success": False,
        "response": "",
        "time_ms": 0.0,
        "error": ""
    }
    
    test_prompt = "Say 'OK' if you can hear me."
    
    payload = {
        "model": model_name,
        "prompt": test_prompt,
        "stream": False,
        "options": {
            "temperature": 0.0
        }
    }
    
    try:
        start_time = time.time()
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=30
        )
        elapsed_ms = (time.time() - start_time) * 1000
        
        response.raise_for_status()
        data = response.json()
        
        result["success"] = True
        result["response"] = data.get("response", "").strip()
        result["time_ms"] = elapsed_ms
        
    except requests.exceptions.Timeout:
        result["error"] = "Request timed out after 30 seconds"
    except requests.exceptions.ConnectionError:
        result["error"] = "Could not connect to Ollama server"
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            result["error"] = f"Model '{model_name}' not found"
        else:
            result["error"] = f"HTTP {e.response.status_code}: {e.response.text}"
    except Exception as e:
        result["error"] = str(e)
    
    return result


def main():
    model_name = os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL)
    
    print("═" * 60)
    print("🏛️  AMENDMENT - Ollama Model Check")
    print("═" * 60)
    print(f"Ollama URL: {OLLAMA_BASE_URL}")
    print(f"Testing model: {model_name}")
    print()
    
    # Test the model
    result = test_model(model_name)
    
    if result["success"]:
        print("✅ SUCCESS")
        print(f"Response: {result['response']}")
        print(f"Time: {result['time_ms']:.1f} ms")
        print()
        return 0
    else:
        print("❌ FAILED")
        print(f"Error: {result['error']}")
        print()
        
        # If model not found, list installed models
        if "not found" in result["error"].lower():
            print("📋 Installed models:")
            models = list_installed_models()
            if models:
                for model in models:
                    print(f"  • {model}")
                print()
                print("💡 Set OLLAMA_MODEL env var to use a different model:")
                print(f"   export OLLAMA_MODEL={models[0]}")
            else:
                print("  (none found or could not connect)")
                print()
                print("💡 Install a model with:")
                print(f"   ollama pull {DEFAULT_MODEL}")
        
        # If connection error, provide help
        elif "connect" in result["error"].lower():
            print("💡 Make sure Ollama is running:")
            print("   ollama serve")
            print()
            print("   Or install Ollama from: https://ollama.ai")
        
        print()
        return 1


if __name__ == "__main__":
    sys.exit(main())
