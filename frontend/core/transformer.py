from __future__ import annotations

from typing import Any

from .parser import ParsedTest


class TransformerError(Exception):
    """Raised when normalized payload cannot be produced."""


def _normalize_step(step_obj: dict[str, Any]) -> dict[str, Any]:
    title = str(step_obj.get('title') or '')
    step_status = str(step_obj.get('status') or '').lower()
    skipped = bool(step_obj.get('skipped', False) or step_status == 'skipped')
    return {
        'title': title,
        'skipped': skipped,
    }


def _normalize_steps(root_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not root_steps:
        return []

    all_steps = [_normalize_step(s) for s in root_steps if isinstance(s, dict)]
    before_hooks = [s for s in all_steps if s['title'] == 'Before Hooks']
    after_hooks = [s for s in all_steps if s['title'] == 'After Hooks']
    middle_steps = [s for s in all_steps if s['title'] not in ('Before Hooks', 'After Hooks')]

    ordered_result = []
    if before_hooks:
        ordered_result.append(before_hooks[0])
    else:
        ordered_result.append({'title': 'Before Hooks', 'skipped': False})

    ordered_result.extend(middle_steps)

    if after_hooks:
        ordered_result.append(after_hooks[0])
    else:
        ordered_result.append({'title': 'After Hooks', 'skipped': False})

    return ordered_result


def transform_tests(parsed_tests: list[ParsedTest]) -> list[dict[str, Any]]:
    normalized_tests: list[dict[str, Any]] = []

    for test in parsed_tests:
        normalized_results: list[dict[str, Any]] = []

        for result in test.results:
            steps = result.get('steps', [])
            if not isinstance(steps, list):
                steps = []
            normalized_results.append({'steps': _normalize_steps(steps)})

        normalized_tests.append(
            {
                'title': test.title,
                'projectName': test.project_name,
                'results': normalized_results,
                'ok': test.ok,
            }
        )

    return normalized_tests
