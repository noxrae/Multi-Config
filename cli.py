from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from uuid import uuid4

from rich.console import Console
from rich.table import Table

from core.builder import build_normalized_report, save_normalized_report
from core.json_loader import JsonLoaderError, find_report_json, load_report_json, list_test_json_files
from core.parser import ParserError, parse_playwright_tests, parse_single_test_json
from core.transformer import transform_tests
from core.zip_handler import ZipHandlerError, extract_zip_safely


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Playwright Report JSON Normalizer (PRJN)")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Normalize command
    norm_parser = subparsers.add_parser("normalize", help="Normalize a playwright-report.zip")
    norm_parser.add_argument("--file", required=True, help="Path to playwright-report.zip")
    norm_parser.add_argument(
        "--output",
        default="output/normalized_report.json",
        help="Path to output normalized JSON file",
    )
    norm_parser.add_argument("--only-failed", action="store_true", help="Include only failed tests")
    norm_parser.add_argument("--project", default=None, help="Filter by project name")
    norm_parser.add_argument("--keep-extracted", action="store_true", help="Keep extracted files for debugging")
    norm_parser.add_argument("--summary-output", help="Path to save summary/analytics JSON file")

    # Compare command
    comp_parser = subparsers.add_parser("compare", help="Compare two normalized JSON reports")
    comp_parser.add_argument("--base", required=True, help="Path to base normalized report.json")
    comp_parser.add_argument("--new", required=True, help="Path to new normalized report.json")
    comp_parser.add_argument("--output", help="Path to save comparison results JSON")

    return parser.parse_args()


def _summarize_tests(normalized_tests: list[dict]) -> dict[str, int]:
    total = len(normalized_tests)
    passed = sum(1 for t in normalized_tests if t.get("ok") is True)
    failed = total - passed
    steps = 0
    for test in normalized_tests:
        for result in test.get("results", []):
            steps += len(result.get("steps", []))
    return {"total": total, "passed": passed, "failed": failed, "steps": steps}


def run_normalize(args: argparse.Namespace, console: Console) -> int:
    from core.analytics import generate_analytics
    
    zip_path = Path(args.file).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    project_root = Path(__file__).resolve().parent
    extracted_root = project_root / "extracted" / uuid4().hex[:12]

    console.print(f"Input ZIP: [yellow]{zip_path}[/yellow]")

    try:
        console.print("[cyan]Step 1/5:[/cyan] Extracting ZIP safely...")
        extracted_dir = extract_zip_safely(zip_path, extracted_root)

        console.print("[cyan]Step 2/5:[/cyan] Discovery phase...")
        test_files = list_test_json_files(extracted_dir)
        
        parsed_tests = []
        if test_files:
            console.print(f"Found {len(test_files)} individual test files. Parsing...")
            for tf in test_files:
                try:
                    t_data = json.loads(tf.read_text(encoding="utf-8"))
                    tests_in_file = parse_single_test_json(t_data)
                    parsed_tests.extend(tests_in_file)
                except Exception:
                    continue
        
        # If no individual files or they failed, try the main report.json
        if not parsed_tests:
            console.print("No individual test files found or parsed. Trying report.json...")
            report_json_path = find_report_json(extracted_dir)
            report_data = load_report_json(report_json_path)
            parsed_tests = parse_playwright_tests(report_data)

        console.print(f"[cyan]Step 4/5:[/cyan] Transforming {len(parsed_tests)} tests...")
        normalized_tests = transform_tests(parsed_tests)

        if args.project:
            normalized_tests = [t for t in normalized_tests if t.get("projectName") == args.project]

        if args.only_failed:
            normalized_tests = [t for t in normalized_tests if t.get("ok") is False]

        report_payload = build_normalized_report(normalized_tests)

        console.print("[cyan]Step 5/5:[/cyan] Saving normalized JSON...")
        saved_path = save_normalized_report(output_path, report_payload)

        summary = _summarize_tests(report_payload["tests"])
        analytics = generate_analytics(report_payload["tests"])

        if args.summary_output:
            summary_path = Path(args.summary_output).expanduser().resolve()
            summary_path.write_text(json.dumps(analytics, indent=2), encoding="utf-8")
            console.print(f"Analytics saved to [yellow]{summary_path}[/yellow]")

        table = Table(title="Normalization Summary")
        table.add_column("Metric", style="bold")
        table.add_column("Value", justify="right")
        table.add_row("Found Tests", str(summary["total"]))
        table.add_row("Passed", str(summary["passed"]))
        table.add_row("Failed", str(summary["failed"]))
        table.add_row("Pass Rate", f"{analytics['summary']['pass_rate_percentage']}%")
        table.add_row("Total Steps", str(summary["steps"]))
        table.add_row("Output", str(saved_path))
        console.print(table)

        return 0
    except (ZipHandlerError, JsonLoaderError, ParserError, ValueError) as exc:
        console.print(f"[bold red]Error:[/bold red] {exc}")
        return 1
    except Exception as exc:
        console.print(f"[bold red]Unexpected Error:[/bold red] {exc}")
        return 1
    finally:
        if not args.keep_extracted and extracted_root.exists():
            shutil.rmtree(extracted_root, ignore_errors=True)


def run_compare(args: argparse.Namespace, console: Console) -> int:
    from core.comparator import compare_reports
    
    base_path = Path(args.base).expanduser().resolve()
    new_path = Path(args.new).expanduser().resolve()

    if not base_path.exists() or not new_path.exists():
        console.print("[bold red]Error:[/bold red] Base or new report file not found.")
        return 1

    try:
        report_a = json.loads(base_path.read_text(encoding="utf-8"))
        report_b = json.loads(new_path.read_text(encoding="utf-8"))

        diff = compare_reports(report_a, report_b)

        if args.output:
            output_path = Path(args.output).expanduser().resolve()
            output_path.write_text(json.dumps(diff, indent=2), encoding="utf-8")
            console.print(f"Comparison saved to [yellow]{output_path}[/yellow]")

        table = Table(title="Comparison Summary")
        table.add_column("Category", style="bold")
        table.add_column("Count", justify="right")
        table.add_row("Common", str(diff["summary"]["common"]))
        table.add_row("Regressions (P->F)", str(diff["summary"]["regressions"]), style="red")
        table.add_row("Improvements (F->P)", str(diff["summary"]["improvements"]), style="green")
        table.add_row("Added", str(diff["summary"]["only_in_new"]), style="blue")
        table.add_row("Removed", str(diff["summary"]["only_in_base"]), style="yellow")
        console.print(table)

        if diff["regressions"]:
            console.print("\n[bold red]Regressions Found:[/bold red]")
            for test in diff["regressions"]:
                console.print(f"- {test}")

        return 0
    except Exception as exc:
        console.print(f"[bold red]Comparison failed:[/bold red] {exc}")
        return 1


def main() -> int:
    args = parse_args()
    console = Console()

    console.print("[bold cyan]Playwright Report JSON Normalizer (PRJN)[/bold cyan]")
    
    if not args.command:
        # Default behavior if no command provided (legacy support or just show help)
        # But here we'll require a command for the new structure.
        console.print("Use 'normalize' or 'compare'. See --help for details.")
        return 0

    if args.command == "normalize":
        return run_normalize(args, console)
    elif args.command == "compare":
        return run_compare(args, console)

    return 0


if __name__ == "__main__":
    sys.exit(main())
