from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class StepModel(BaseModel):
    title: str = ''
    skipped: bool = False


class ResultModel(BaseModel):
    steps: list[StepModel] = Field(default_factory=list)


class TestModel(BaseModel):
    title: str = ''
    projectName: str = 'unknown'
    results: list[ResultModel] = Field(default_factory=list)
    ok: bool = False


class NormalizedReportModel(BaseModel):
    tests: list[TestModel] = Field(default_factory=list)


def build_normalized_report(normalized_tests: list[dict[str, Any]]) -> dict[str, Any]:
    report = NormalizedReportModel(tests=[TestModel(**test) for test in normalized_tests])
    return report.model_dump(mode='json')


def save_normalized_report(output_path: Path, report_payload: dict[str, Any]) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report_payload, indent=2, ensure_ascii=False), encoding='utf-8')
    return output_path
