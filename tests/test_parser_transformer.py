from pathlib import Path

from core.parser import parse_playwright_tests
from core.transformer import transform_tests


def test_parse_and_transform_nested_report() -> None:
    report = Path(__file__).parent / "fixtures" / "report.json"
    data = __import__("json").loads(report.read_text(encoding="utf-8"))

    parsed = parse_playwright_tests(data)
    assert len(parsed) == 2

    normalized = transform_tests(parsed)
    assert len(normalized) == 2

    first = normalized[0]
    assert first["title"] == "w01_login_pass"
    assert first["projectName"] == "chromium"
    assert first["ok"] is True

    first_steps = first["results"][0]["steps"]
    assert first_steps[0] == {"title": "Before Hooks", "skipped": False}
    assert {"title": "After Hooks", "skipped": True} in first_steps
    assert {"title": "Type username", "skipped": False} in first_steps

    second = normalized[1]
    assert second["title"] == "w02_checkout_fail"
    assert second["ok"] is False
