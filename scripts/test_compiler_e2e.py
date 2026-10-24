#!/usr/bin/env python3
"""
End-to-end test of the compiler with real Ollama.

This test requires Ollama to be running with gemma3:4b installed.
Run: python3 scripts/test_compiler_e2e.py
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.court import compile_amendment
from backend.court.providers import get_provider
from backend.engine.validate import validate_rule


def test_e2e():
    """Run end-to-end compiler tests."""
    print("═" * 70)
    print("🏛️  AMENDMENT - Compiler End-to-End Test")
    print("═" * 70)
    print()
    
    # Check provider availability
    print("Checking provider...", end=" ", flush=True)
    provider = get_provider()
    if not provider.is_available():
        print("❌ NOT AVAILABLE")
        print()
        print("⚠️  Ollama or model not available. Skipping E2E test.")
        print("   Install: ollama pull gemma3:4b")
        print("   Run: ollama serve")
        return 1
    print("✅ READY")
    print(f"Provider: {provider}")
    print()
    
    # Sample game state
    state = {
        "settings": {
            "board_size": 6,
            "dice_type": "1d6",
            "win_target": 10,
            "max_rules": 8
        },
        "rules": [{"id": "R2"}],
        "players": [
            {"id": "P1", "name": "Alice", "score": 3, "position": 5}
        ]
    }
    
    # Test cases
    test_cases = [
        {
            "name": "Simple scoring rule",
            "text": "When you land on a tile, gain 2 extra points",
            "should_accept": True
        },
        {
            "name": "Conditional rule",
            "text": "When you roll an even number, gain 3 points",
            "should_accept": True
        },
        {
            "name": "Leader rule",
            "text": "If you're in last place when you land, steal 2 points from the leader",
            "should_accept": True
        },
        {
            "name": "Complex condition",
            "text": "If your score is greater than 5 and you land on a tile, move forward 2 spaces",
            "should_accept": True
        }
    ]
    
    passed = 0
    failed = 0
    
    for i, test in enumerate(test_cases, 1):
        print("─" * 70)
        print(f"Test {i}: {test['name']}")
        print(f"Text: {test['text']}")
        print()
        
        print("Compiling...", end=" ", flush=True)
        result = compile_amendment(test["text"], state, validate_rule)
        
        if result["accepted"]:
            print("✅ ACCEPTED")
            if test["should_accept"]:
                print("✓ Expected acceptance")
                
                # Show the rule
                rule = result["rule"]
                print(f"  Trigger: {rule['trigger']}")
                print(f"  Condition: {rule['condition']['mode']} of {len(rule['condition']['predicates'])} predicate(s)")
                print(f"  Effect: {rule['effect']['type']} {rule['effect'].get('amount', 'N/A')} → {rule['effect']['target']}")
                
                # Validate with engine
                valid, error = validate_rule(rule)
                if valid:
                    print("  ✓ Passes engine validation")
                    passed += 1
                else:
                    print(f"  ✗ Engine validation failed: {error}")
                    failed += 1
            else:
                print("✗ Expected rejection")
                failed += 1
        else:
            print("❌ REJECTED")
            print(f"Error: {result['error']}")
            if not test["should_accept"]:
                print("✓ Expected rejection")
                passed += 1
            else:
                print("✗ Expected acceptance")
                failed += 1
        
        print()
    
    # Summary
    print("═" * 70)
    print("Summary")
    print("═" * 70)
    total = passed + failed
    print(f"Passed: {passed}/{total}")
    print(f"Failed: {failed}/{total}")
    print("═" * 70)
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(test_e2e())
