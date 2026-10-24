"""
JSON schema for Court LLM structured output.

Used by Ollama's `format` parameter to constrain output structure
without restricting enums or ranges (so out-of-range/unsupported rules reach the validator).
"""

RULE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "trigger": {"type": "string"},
        "condition": {
            "type": "object",
            "properties": {
                "mode": {"type": "string"},
                "predicates": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "args": {"type": "object"},
                        },
                    },
                },
            },
        },
        "effect": {
            "type": "object",
            "properties": {
                "type": {"type": "string"},
                "amount": {"type": "integer"},
                "target": {"type": "string"},
            },
        },
        "source": {"type": "string"},
        "not_a_game_rule": {"type": "boolean"},
        "reason": {"type": "string"},
    },
}
