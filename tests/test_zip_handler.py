import zipfile
from pathlib import Path

from core.zip_handler import ZipHandlerError, extract_zip_safely


def test_extract_zip_safely_rejects_path_traversal(tmp_path: Path) -> None:
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../evil.txt", "x")

    dest = tmp_path / "extract"
    try:
        extract_zip_safely(zip_path, dest)
        assert False, "Expected ZipHandlerError"
    except ZipHandlerError:
        assert True


def test_extract_zip_safely_valid_zip(tmp_path: Path) -> None:
    zip_path = tmp_path / "good.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("playwright-report/data/report.json", '{"suites": []}')

    dest = tmp_path / "extract2"
    extracted = extract_zip_safely(zip_path, dest)
    assert (extracted / "playwright-report" / "data" / "report.json").exists()
