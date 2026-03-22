import json
import subprocess
import sys
import zipfile
from pathlib import Path


def test_cli_end_to_end(tmp_path: Path) -> None:
    source_report = Path(__file__).parent / "fixtures" / "report.json"
    zip_path = tmp_path / "playwright-report.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("playwright-report/data/report.json", source_report.read_text(encoding="utf-8"))

    out_path = tmp_path / "normalized_report.json"
    project_root = Path(__file__).resolve().parents[1]

    result = subprocess.run(
        [sys.executable, "cli.py", "normalize", "--file", str(zip_path), "--output", str(out_path)],
        cwd=project_root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert out_path.exists()

    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert "tests" in payload
    assert len(payload["tests"]) == 2
