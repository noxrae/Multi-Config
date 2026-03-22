from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ParsedTest:
    title: str
    project_name: str
    ok: bool
    results: list[dict[str, Any]]


class ParserError(Exception):
    """Raised when Playwright schema cannot be parsed."""


def _derive_ok(test_obj: dict[str, Any]) -> bool:
    if isinstance(test_obj.get("ok"), bool):
        return bool(test_obj["ok"])

    status = str(test_obj.get("status", "")).lower()
    if status in {"passed", "expected", "ok"}:
        return True
    if status in {"failed", "timedout", "interrupted"}:
        return False

    results = test_obj.get("results", [])
    if isinstance(results, list) and results:
        normalized = [str(r.get("status", "")).lower() for r in results if isinstance(r, dict)]
        if any(s in {"failed", "timedout", "interrupted"} for s in normalized):
            return False
        if normalized and all(s in {"passed", "expected", "skipped"} for s in normalized):
            return True

    return False


def parse_single_test_json(file_data: dict[str, Any]) -> list[ParsedTest]:
    """Parses a single test JSON file (hex-named files) which contains a 'tests' array."""
    tests_list = file_data.get("tests", [])
    if not isinstance(tests_list, list):
        return []

    parsed_results: list[ParsedTest] = []
    for test_data in tests_list:
        if not isinstance(test_data, dict):
            continue
            
        title = str(test_data.get("title") or "")
        project_name = str(test_data.get("projectName") or "unknown")
        results = test_data.get("results", [])
        if not isinstance(results, list):
            results = []

        parsed_results.append(
            ParsedTest(
                title=title,
                project_name=project_name,
                ok=_derive_ok(test_data),
                results=[r for r in results if isinstance(r, dict)],
            )
        )
    return parsed_results


def parse_playwright_tests(report_data: dict[str, Any]) -> list[ParsedTest]:
    suites = report_data.get("suites")
    if not isinstance(suites, list):
        raise ParserError("Invalid report format: 'suites' must be a list")

    parsed_tests: list[ParsedTest] = []
    stack: list[dict[str, Any]] = [suite for suite in reversed(suites) if isinstance(suite, dict)]

    while stack:
        suite = stack.pop()

        child_suites = suite.get("suites", [])
        if isinstance(child_suites, list):
            for child in reversed(child_suites):
                if isinstance(child, dict):
                    stack.append(child)

        specs = suite.get("specs", [])
        if not isinstance(specs, list):
            continue

        for spec in specs:
            if not isinstance(spec, dict):
                continue
            tests = spec.get("tests", [])
            if not isinstance(tests, list):
                continue

            for test in tests:
                if not isinstance(test, dict):
                    continue

                title = str(test.get("title") or spec.get("title") or "")
                project_name = str(test.get("projectName") or "unknown")
                results = test.get("results", [])
                if not isinstance(results, list):
                    results = []

                parsed_tests.append(
                    ParsedTest(
                        title=title,
                        project_name=project_name,
                        ok=_derive_ok(test),
                        results=[r for r in results if isinstance(r, dict)],
                    )
                )

    return parsed_tests
