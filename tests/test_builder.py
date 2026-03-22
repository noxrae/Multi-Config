from pathlib import Path

from core.builder import build_normalized_report, save_normalized_report


def test_builder_generates_exact_top_level_schema(tmp_path: Path) -> None:
    tests = [
        {
            "title": "sample",
            "projectName": "chromium",
            "results": [{"steps": [{"title": "s1", "skipped": False}]}],
            "ok": True,
        }
    ]

    payload = build_normalized_report(tests)
    assert list(payload.keys()) == ["tests"]
    assert payload["tests"][0]["title"] == "sample"

    out = tmp_path / "normalized_report.json"
    saved = save_normalized_report(out, payload)
    assert saved.exists()
