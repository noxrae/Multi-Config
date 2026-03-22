from __future__ import annotations

import io
import json
import time
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from web.app import app


client = TestClient(app)


def _build_zip_bytes() -> bytes:
    fixture = Path(__file__).parent / "fixtures" / "report.json"
    data = fixture.read_text(encoding="utf-8")
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w") as zf:
        zf.writestr("playwright-report/data/report.json", data)
    return bio.getvalue()


def test_web_start_and_complete_job() -> None:
    files = {
        "file": ("playwright-report.zip", _build_zip_bytes(), "application/zip"),
    }
    start_resp = client.post("/api/start", files=files)
    assert start_resp.status_code == 200
    payload = start_resp.json()
    assert "job_id" in payload

    job_id = payload["job_id"]

    # Poll until complete
    for _ in range(30):
        p_resp = client.get(f"/api/progress/{job_id}")
        assert p_resp.status_code == 200
        progress = p_resp.json()
        if progress["status"] == "completed":
            break
        assert progress["status"] in {"queued", "running"}
        time.sleep(0.1)
    else:
        raise AssertionError("Job did not complete in time")

    dl_resp = client.get(f"/api/download/{job_id}")
    assert dl_resp.status_code == 200

    result_resp = client.get(f"/api/result/{job_id}")
    assert result_resp.status_code == 200
    result = result_resp.json()
    assert "tests" in result
    assert isinstance(result["tests"], list)


def test_web_rejects_non_zip_upload() -> None:
    files = {
        "file": ("bad.txt", b"oops", "text/plain"),
    }
    response = client.post("/api/start", files=files)
    assert response.status_code == 422
    assert "zip" in response.json()["detail"].lower()
