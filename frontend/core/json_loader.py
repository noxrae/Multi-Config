from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class JsonLoaderError(Exception):
    """Raised when report JSON cannot be discovered or loaded."""


def find_report_json(extracted_root: Path) -> Path:
    candidates = list(extracted_root.rglob('report.json'))
    if not candidates:
        raise JsonLoaderError('report.json not found inside extracted ZIP')
    candidates.sort(key=lambda p: (0 if 'playwright-report' in str(p).lower() else 1, len(str(p))))
    return candidates[0]


def list_test_json_files(extracted_root: Path) -> list[Path]:
    all_jsons = list(extracted_root.rglob('*.json'))
    test_files = [
        p for p in all_jsons
        if p.name.lower() != 'report.json'
        and 'normalized_report' not in p.name.lower()
    ]
    return test_files


def load_report_json(report_json_path: Path) -> dict[str, Any]:
    if not report_json_path.exists():
        raise JsonLoaderError(f'report.json not found at: {report_json_path}')

    try:
        data = json.loads(report_json_path.read_text(encoding='utf-8'))
    except json.JSONDecodeError as exc:
        raise JsonLoaderError('report.json is malformed JSON') from exc

    if not isinstance(data, dict):
        raise JsonLoaderError('report.json root must be a JSON object')

    if 'suites' not in data or not isinstance(data['suites'], list):
        raise JsonLoaderError("Unexpected Playwright structure: missing 'suites' array")

    return data
