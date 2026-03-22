from __future__ import annotations

from typing import Any

from core.parser import ParsedTest


class TransformerError(Exception):
    """Raised when normalized payload cannot be produced."""


def _normalize_step(step_obj: dict[str, Any]) -> dict[str, Any]:
    title = str(step_obj.get("title") or "")
    step_status = str(step_obj.get("status") or "").lower()
    skipped = bool(step_obj.get("skipped", False) or step_status == "skipped")
    return {
        "title": title,
        "skipped": skipped,
    }


def _normalize_steps(root_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Normalizes steps to ensure they strictly start with 'Before Hooks' 
    and end with 'After Hooks', using only top-level steps to avoid 
    trailing sub-steps after the final hook.
    """
    if not root_steps:
        return []

    # 1. Normalize all top-level steps from the results array
    all_steps = [_normalize_step(s) for s in root_steps if isinstance(s, dict)]
    
    # 2. Extract Before Hooks, After Hooks, and everything in between
    before_hooks = [s for s in all_steps if s["title"] == "Before Hooks"]
    after_hooks = [s for s in all_steps if s["title"] == "After Hooks"]
    middle_steps = [s for s in all_steps if s["title"] not in ("Before Hooks", "After Hooks")]
    
    ordered_result = []
    
    # Ensure Before Hooks is first (if it exists)
    if before_hooks:
        ordered_result.append(before_hooks[0])
    else:
        # User requested it starts with Before Hooks, so we ensure it's there if possible
        ordered_result.append({"title": "Before Hooks", "skipped": False})
        
    # Add all actual test actions
    ordered_result.extend(middle_steps)
    
    # Ensure After Hooks is last (if it exists)
    if after_hooks:
        ordered_result.append(after_hooks[0])
    else:
        # User requested it ends with After Hooks
        ordered_result.append({"title": "After Hooks", "skipped": False})
        
    return ordered_result


def transform_tests(parsed_tests: list[ParsedTest]) -> list[dict[str, Any]]:
    normalized_tests: list[dict[str, Any]] = []

    for test in parsed_tests:
        normalized_results: list[dict[str, Any]] = []

        for result in test.results:
            steps = result.get("steps", [])
            if not isinstance(steps, list):
                steps = []
            normalized_results.append({"steps": _normalize_steps(steps)})

        normalized_tests.append(
            {
                "title": test.title,
                "projectName": test.project_name,
                "results": normalized_results,
                "ok": test.ok,
            }
        )

    return normalized_tests
