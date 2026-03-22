from pathlib import Path

from core.json_loader import find_report_json, load_report_json


def test_load_report_json_fixture() -> None:
    root = Path(__file__).parent / "fixtures"
    report_path = find_report_json(root)
    data = load_report_json(report_path)

    assert isinstance(data, dict)
    assert "suites" in data
    assert isinstance(data["suites"], list)
