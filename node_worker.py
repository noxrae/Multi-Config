from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from core.analytics import generate_analytics
from core.builder import build_normalized_report, save_normalized_report
from core.json_loader import find_report_json, list_test_json_files, load_report_json
from core.parser import parse_playwright_tests, parse_single_test_json
from core.transformer import transform_tests
from core.zip_handler import extract_zip_safely


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {}
    return json.loads(state_path.read_text(encoding="utf-8"))


def write_state(state_path: Path, **updates) -> None:
    current = read_state(state_path)
    current.update(updates)
    current["updated_at"] = iso_now()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(current, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Background worker for Next.js job processing")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--extracted-dir", required=True)
    return parser.parse_args()


def process_job(job_id: str, zip_path: Path, state_path: Path, output_dir: Path, extracted_dir_root: Path) -> None:
    extracted_root = extracted_dir_root / job_id
    output_path = output_dir / f"normalized_report_{job_id}.json"

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        extracted_dir_root.mkdir(parents=True, exist_ok=True)

        write_state(
            state_path,
            status="running",
            phase="Extracting ZIP",
            current_phase=1,
            total_phases=5,
            message="Validating and unpacking ZIP",
        )
        extracted_dir = extract_zip_safely(zip_path, extracted_root)

        write_state(
            state_path,
            phase="Discovery Phase",
            current_phase=2,
            message="Searching for test result files",
        )
        test_files = list_test_json_files(extracted_dir)

        parsed_tests = []
        if test_files:
            write_state(
                state_path,
                phase="Parsing Data",
                current_phase=3,
                message=f"Parsing {len(test_files)} JSON files",
            )
            for test_file in test_files:
                try:
                    test_data = json.loads(test_file.read_text(encoding="utf-8"))
                    parsed_tests.extend(parse_single_test_json(test_data))
                except Exception:
                    continue

        if not parsed_tests:
            write_state(
                state_path,
                phase="Parsing report.json",
                current_phase=3,
                message="No individual files found, trying report.json",
            )
            report_data = load_report_json(find_report_json(extracted_dir))
            parsed_tests = parse_playwright_tests(report_data)

        write_state(
            state_path,
            phase="Transforming Schema",
            current_phase=4,
            message=f"Normalizing {len(parsed_tests)} tests",
        )
        payload = build_normalized_report(transform_tests(parsed_tests))

        write_state(
            state_path,
            phase="Saving Output",
            current_phase=5,
            message="Writing final normalized JSON",
        )
        saved_file = save_normalized_report(output_path, payload)

        analytics = generate_analytics(payload["tests"])
        summary = {
            "total": analytics["summary"]["total_tests"],
            "passed": analytics["summary"]["passed"],
            "failed": analytics["summary"]["failed"],
            "steps": analytics["step_analytics"]["total_steps"],
            "pass_rate": analytics["summary"]["pass_rate_percentage"],
        }

        write_state(
            state_path,
            status="completed",
            phase="Completed",
            current_phase=5,
            total_phases=5,
            message="Normalization finished",
            output_file=str(saved_file),
            summary=summary,
        )
    except Exception as exc:
        write_state(
            state_path,
            status="failed",
            phase="Failed",
            message=str(exc),
            error=str(exc),
        )
    finally:
        if extracted_root.exists():
            shutil.rmtree(extracted_root, ignore_errors=True)


def main() -> int:
    args = parse_args()
    process_job(
        job_id=args.job_id,
        zip_path=Path(args.input).resolve(),
        state_path=Path(args.state).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        extracted_dir_root=Path(args.extracted_dir).resolve(),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
