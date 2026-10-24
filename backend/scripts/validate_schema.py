"""
Validate rulebook.schema.json against representative test cases,
and cross-check with engine.validate.validate_rule().
Run from backend/: python3 scripts/validate_schema.py
"""
import json
import sys
import jsonschema

sys.path.insert(0, ".")
from engine.validate import validate_rule

SCHEMA_PATH = "../schema/rulebook.schema.json"

# Helpers
def rb(rules, board_sizes=None):
    r = {"name": "T", "rules": rules}
    if board_sizes is not None:
        r["board_sizes"] = board_sizes
    return r

def rule(trigger, etype, amount, target, predicates=None, mode="all"):
    return {
        "trigger": trigger,
        "condition": {"mode": mode, "predicates": predicates or []},
        "effect": {"type": etype, "amount": amount, "target": target},
    }

def pred(name, value=None):
    if value is not None:
        return {"name": name, "args": {"value": value}}
    return {"name": name}

# Test cases: (label, rulebook, schema_should_pass, [(engine_label, rule, engine_should_pass)])
CASES = [
    # --- VALID ---
    ("valid: unconditional add_score 2",
     rb([rule("on_land","add_score",2,"self")]), True,
     [("add_score 2 self", rule("on_land","add_score",2,"self"), True)]),

    ("valid: score_gt predicate",
     rb([rule("on_turn_start","add_score",1,"self", [pred("score_gt",5)])]), True,
     [("score_gt 5", rule("on_turn_start","add_score",1,"self",[pred("score_gt",5)]), True)]),

    ("valid: set_win_target=5 (lower bound)",
     rb([rule("win_check","set_win_target",5,"self")]), True,
     [("swt 5", rule("win_check","set_win_target",5,"self"), True)]),

    ("valid: set_win_target=30 (upper bound)",
     rb([rule("win_check","set_win_target",30,"self")]), True,
     [("swt 30", rule("win_check","set_win_target",30,"self"), True)]),

    ("valid: add_score -5 (lower bound)",
     rb([rule("on_land","add_score",-5,"leader")]), True,
     [("add_score -5", rule("on_land","add_score",-5,"leader"), True)]),

    ("valid: reroll amount=0",
     rb([rule("on_roll","reroll",0,"self")]), True,
     [("reroll 0", rule("on_roll","reroll",0,"self"), True)]),

    ("valid: empty rules",
     rb([], [6,8,10]), True, []),

    ("valid: any-mode multi-predicate",
     rb([rule("on_land","steal_score",3,"last",[pred("is_leader"),pred("tile_is_prime")],"any")]), True,
     [("steal any-mode", rule("on_land","steal_score",3,"last",[pred("is_leader"),pred("tile_is_prime")],"any"), True)]),

    ("valid: board_sizes absent",
     rb([]), True, []),

    # --- INVALID ---
    ("INVALID: amount 6 (exceeds +5)",
     rb([rule("on_land","add_score",6,"self")]), False,
     [("add_score 6", rule("on_land","add_score",6,"self"), False)]),

    ("INVALID: amount -6 (below -5)",
     rb([rule("on_land","add_score",-6,"self")]), False,
     [("add_score -6", rule("on_land","add_score",-6,"self"), False)]),

    ("INVALID: set_win_target=4 (below 5)",
     rb([rule("win_check","set_win_target",4,"self")]), False,
     [("swt 4", rule("win_check","set_win_target",4,"self"), False)]),

    ("INVALID: set_win_target=31 (above 30)",
     rb([rule("win_check","set_win_target",31,"self")]), False,
     [("swt 31", rule("win_check","set_win_target",31,"self"), False)]),

    ("INVALID: unknown trigger on_death",
     rb([rule("on_death","add_score",1,"self")]), False,
     [("on_death", rule("on_death","add_score",1,"self"), False)]),

    ("INVALID: unknown effect type explode",
     rb([rule("on_land","explode",1,"self")]), False,
     [("explode", rule("on_land","explode",1,"self"), False)]),

    ("INVALID: unknown target everyone",
     rb([rule("on_land","add_score",1,"everyone")]), False,
     [("target everyone", rule("on_land","add_score",1,"everyone"), False)]),

    ("INVALID: score_gt missing args",
     rb([rule("on_turn_start","add_score",1,"self",[pred("score_gt")])]), False,
     [("score_gt no args", rule("on_turn_start","add_score",1,"self",[pred("score_gt")]), False)]),

    ("INVALID: missing effect field",
     rb([{"trigger":"on_land","condition":{"mode":"all","predicates":[]}}]), False,
     [("no effect", {"trigger":"on_land","condition":{"mode":"all","predicates":[]}}, False)]),

    ("INVALID: unknown predicate is_awesome",
     rb([rule("on_land","add_score",1,"self",[{"name":"is_awesome"}])]), False,
     [("pred is_awesome", rule("on_land","add_score",1,"self",[{"name":"is_awesome"}]), False)]),
]

def main():
    with open(SCHEMA_PATH) as f:
        schema = json.load(f)

    # Check schema itself is valid Draft-07
    try:
        jsonschema.Draft7Validator.check_schema(schema)
        print("SCHEMA SELF-CHECK: valid Draft-07 JSON Schema")
    except jsonschema.SchemaError as e:
        print(f"SCHEMA SELF-CHECK FAILED: {e.message}")
        sys.exit(1)

    print()
    hdr = f"{'Test label':<45}  {'Schema':>7}  {'Engine':>7}  {'Match':>8}"
    print(hdr)
    print("-" * len(hdr))

    all_ok = True
    mismatches = []

    for label, rulebook, expect_schema, ecases in CASES:
        try:
            jsonschema.validate(rulebook, schema)
            schema_pass = True
            schema_msg = ""
        except jsonschema.ValidationError as e:
            schema_pass = False
            schema_msg = e.message[:70]

        smatch = schema_pass == expect_schema
        if not smatch:
            all_ok = False
            mismatches.append(
                f"  SCHEMA [{label}]: expected {'PASS' if expect_schema else 'FAIL'}, "
                f"got {'PASS' if schema_pass else 'FAIL'} — {schema_msg}"
            )

        print(f"{label:<45}  {'PASS' if schema_pass else 'FAIL':>7}  "
              f"{'':>7}  {'OK' if smatch else 'MISMATCH':>8}")

        for elabel, r, expect_eng in ecases:
            ok, err = validate_rule(r)
            ematch = ok == expect_eng
            if not ematch:
                all_ok = False
                mismatches.append(
                    f"  ENGINE [{label} / {elabel}]: expected {'PASS' if expect_eng else 'FAIL'}, "
                    f"got {'PASS' if ok else 'FAIL'} — {err}"
                )
            print(f"  engine: {elabel:<37}  {'':>7}  {'PASS' if ok else 'FAIL':>7}  {'OK' if ematch else 'MISMATCH':>8}")

    print()
    if all_ok:
        print("RESULT: ALL CASES MATCH EXPECTATIONS — schema and engine are consistent.")
    else:
        print("RESULT: MISMATCHES FOUND:")
        for m in mismatches:
            print(m)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
