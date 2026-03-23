from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from core.analytics import generate_analytics
from core.builder import build_normalized_report
from core.json_loader import find_report_json, list_test_json_files, load_report_json
from core.parser import parse_playwright_tests, parse_single_test_json
from core.transformer import transform_tests
from core.zip_handler import extract_zip_safely

app = FastAPI(title='Nova Normalizer Function')


def _normalize_zip(zip_bytes: bytes) -> tuple[dict, dict]:
    work_root = Path(tempfile.mkdtemp(prefix='nova-normalizer-'))
    zip_path = work_root / 'report.zip'
    extract_root = work_root / 'extracted'

    try:
        zip_path.write_bytes(zip_bytes)
        extracted_dir = extract_zip_safely(zip_path, extract_root)
        test_files = list_test_json_files(extracted_dir)

        parsed_tests = []
        if test_files:
            for test_file in test_files:
                try:
                    test_data = json.loads(test_file.read_text(encoding='utf-8'))
                    parsed_tests.extend(parse_single_test_json(test_data))
                except Exception:
                    continue

        if not parsed_tests:
            report_data = load_report_json(find_report_json(extracted_dir))
            parsed_tests = parse_playwright_tests(report_data)

        payload = build_normalized_report(transform_tests(parsed_tests))
        analytics = generate_analytics(payload['tests'])
        summary = {
            'total': analytics['summary']['total_tests'],
            'passed': analytics['summary']['passed'],
            'failed': analytics['summary']['failed'],
            'steps': analytics['step_analytics']['total_steps'],
            'pass_rate': analytics['summary']['pass_rate_percentage'],
        }
        return payload, summary
    finally:
        shutil.rmtree(work_root, ignore_errors=True)


@app.post('')
@app.post('/')
async def normalize(file: UploadFile = File(...)):
    try:
        payload, summary = _normalize_zip(await file.read())
        return JSONResponse({'result': payload, 'summary': summary})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
