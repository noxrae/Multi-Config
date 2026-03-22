from __future__ import annotations

from typing import Any


def compare_reports(report_a: dict[str, Any], report_b: dict[str, Any]) -> dict[str, Any]:
    tests_a = { (t["title"], t.get("projectName", "unknown")): t for t in report_a.get("tests", []) }
    tests_b = { (t["title"], t.get("projectName", "unknown")): t for t in report_b.get("tests", []) }

    keys_a = set(tests_a.keys())
    keys_b = set(tests_b.keys())

    only_in_a = keys_a - keys_b
    only_in_b = keys_b - keys_a
    common = keys_a & keys_b

    regressions = []
    improvements = []
    unchanged = []

    for k in common:
        test_a = tests_a[k]
        test_b = tests_b[k]
        if test_a["ok"] and not test_b["ok"]:
            regressions.append(k[0])
        elif not test_a["ok"] and test_b["ok"]:
            improvements.append(k[0])
        else:
            unchanged.append(k[0])

    return {
        "summary": {
            "only_in_base": len(only_in_a),
            "only_in_new": len(only_in_b),
            "common": len(common),
            "regressions": len(regressions),
            "improvements": len(improvements),
            "unchanged": len(unchanged),
        },
        "regressions": regressions,
        "improvements": improvements,
        "added": [k[0] for k in only_in_b],
        "removed": [k[0] for k in only_in_a],
    }
