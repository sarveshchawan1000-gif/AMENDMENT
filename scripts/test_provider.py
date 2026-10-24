#!/usr/bin/env python3
"""
Test the Court AI provider layer.

Tests connectivity, basic generation, and error handling.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.court.providers import get_provider, ProviderError, ProviderTimeoutError, ProviderConnectionError
from backend.court.config import CourtConfig


def test_provider_availability():
    """Test if the provider is available."""
    print("═" * 60)
    print("🏛️  AMENDMENT - Court Provider Test")
    print("═" * 60)
    print(f"Provider: {CourtConfig.PROVIDER}")
    print(f"Model: {CourtConfig.OLLAMA_MODEL if CourtConfig.PROVIDER == 'ollama' else CourtConfig.GEMINI_MODEL}")
    print()
    
    try:
        provider = get_provider()
        print(f"✓ Provider initialized: {provider}")
        
        # Check availability
        print("Checking provider availability...", end=" ", flush=True)
        if provider.is_available():
            print("✅ AVAILABLE")
            return provider
        else:
            print("❌ NOT AVAILABLE")
            print()
            if CourtConfig.PROVIDER == "ollama":
                print("💡 Troubleshooting:")
                print("   1. Make sure Ollama is running: ollama serve")
                print(f"   2. Install the model: ollama pull {CourtConfig.OLLAMA_MODEL}")
                print(f"   3. Check Ollama URL: {CourtConfig.OLLAMA_URL}")
            return None
            
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return None


def test_basic_generation(provider):
    """Test basic text generation."""
    print()
    print("─" * 60)
    print("Test 1: Basic Generation")
    print("─" * 60)
    
    test_prompt = "Say 'The Court is in session' and nothing else."
    
    try:
        print(f"Prompt: {test_prompt}")
        print("Generating...", end=" ", flush=True)
        
        response = provider.generate(prompt=test_prompt)
        
        print("✅ SUCCESS")
        print(f"Response: {response}")
        return True
        
    except ProviderTimeoutError as e:
        print(f"❌ TIMEOUT: {e}")
        return False
    except ProviderConnectionError as e:
        print(f"❌ CONNECTION ERROR: {e}")
        return False
    except ProviderError as e:
        print(f"❌ PROVIDER ERROR: {e}")
        return False
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        return False


def test_system_prompt(provider):
    """Test generation with system prompt."""
    print()
    print("─" * 60)
    print("Test 2: System Prompt")
    print("─" * 60)
    
    system_prompt = "You are a stern judge. Respond in exactly 5 words."
    user_prompt = "What is your role?"
    
    try:
        print(f"System: {system_prompt}")
        print(f"Prompt: {user_prompt}")
        print("Generating...", end=" ", flush=True)
        
        response = provider.generate(
            prompt=user_prompt,
            system_prompt=system_prompt
        )
        
        print("✅ SUCCESS")
        print(f"Response: {response}")
        word_count = len(response.split())
        print(f"Word count: {word_count} (requested: 5)")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_json_generation(provider):
    """Test structured JSON generation (if supported)."""
    print()
    print("─" * 60)
    print("Test 3: JSON Structured Output")
    print("─" * 60)
    
    schema = {
        "type": "object",
        "properties": {
            "verdict": {"type": "string"},
            "confident": {"type": "boolean"}
        },
        "required": ["verdict", "confident"]
    }
    
    prompt = "Is 2+2=4? Respond with a verdict and whether you're confident."
    
    try:
        print(f"Prompt: {prompt}")
        print(f"Schema: {schema}")
        print("Generating...", end=" ", flush=True)
        
        response = provider.generate(
            prompt=prompt,
            json_schema=schema
        )
        
        print("✅ SUCCESS")
        print(f"Response: {response}")
        
        # Try to parse as JSON
        import json
        try:
            parsed = json.loads(response)
            print(f"✓ Valid JSON: {parsed}")
        except json.JSONDecodeError:
            print("⚠️  Response is not valid JSON (schema may not be supported)")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        print("Note: JSON schema may not be supported by this provider/model")
        return False


def main():
    """Run all tests."""
    # Test 0: Availability
    provider = test_provider_availability()
    if not provider:
        print()
        print("═" * 60)
        print("⚠️  Provider not available. Cannot run generation tests.")
        print("═" * 60)
        return 1
    
    # Run generation tests
    results = []
    results.append(("Basic Generation", test_basic_generation(provider)))
    results.append(("System Prompt", test_system_prompt(provider)))
    results.append(("JSON Output", test_json_generation(provider)))
    
    # Summary
    print()
    print("═" * 60)
    print("Test Summary")
    print("═" * 60)
    for test_name, passed in results:
        status = "✅" if passed else "❌"
        print(f"{status} {test_name}")
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    print()
    print(f"Passed: {passed_count}/{total_count}")
    print("═" * 60)
    
    return 0 if passed_count == total_count else 1


if __name__ == "__main__":
    sys.exit(main())
