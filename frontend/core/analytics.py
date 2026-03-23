from __future__ import annotations

from typing import Any


def generate_analytics(normalized_tests: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(normalized_tests)
    passed = sum(1 for t in normalized_tests if t.get('ok') is True)
    failed = total - passed
    pass_rate = (passed / total * 100) if total > 0 else 0

    projects: dict[str, dict[str, int]] = {}
    for test in normalized_tests:
        p_name = test.get('projectName', 'unknown')
        if p_name not in projects:
            projects[p_name] = {'total': 0, 'passed': 0, 'failed': 0}
        projects[p_name]['total'] += 1
        if test.get('ok') is True:
            projects[p_name]['passed'] += 1
        else:
            projects[p_name]['failed'] += 1

    total_steps = 0
    skipped_steps = 0
    for test in normalized_tests:
        for result in test.get('results', []):
            steps = result.get('steps', [])
            total_steps += len(steps)
            skipped_steps += sum(1 for s in steps if s.get('skipped') is True)

    return {
        'summary': {
            'total_tests': total,
            'passed': passed,
            'failed': failed,
            'pass_rate_percentage': round(pass_rate, 2),
        },
        'project_breakdown': projects,
        'step_analytics': {
            'total_steps': total_steps,
            'skipped_steps': skipped_steps,
            'skipped_percentage': round((skipped_steps / total_steps * 100), 2) if total_steps > 0 else 0,
        },
    }
