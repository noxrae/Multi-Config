# Playwright Report JSON Normalizer (PRJN)

PRJN now uses a Next.js application as the primary web stack and keeps Python only for the normalization engine and the intelligent pytest-weightage analysis.

## Required Output Schema

```json
{
  "tests": [
    {
      "title": "...",
      "projectName": "...",
      "results": [
        {
          "steps": [
            { "title": "...", "skipped": false }
          ]
        }
      ],
      "ok": true
    }
  ]
}
```

## Install

Python dependencies for the core engine:

```bash
pip install -r requirements.txt
```

Frontend dependencies:

```bash
cd frontend
npm install
```

## CLI Mode

```bash
python cli.py normalize --file uploads/playwright-report.zip --output output/normalized_report.json
```

## Web Mode

```bash
cd frontend
npm run dev
```

Open:

- `http://localhost:3000`

Web flow:

1. Upload Playwright report ZIP.
2. Next.js stores the job and starts a background Python worker for normalization.
3. The UI polls native Next.js API routes for progress, preview, and download.
4. Python is used only for the normalization engine and intelligent pytest analysis.

## Stack

- UI and web server: `Next.js 14` + `React` + route handlers on Node.js
- Core normalization engine: Python modules in `core/`
- Background execution bridge: `node_worker.py`
- Config parsing and standard weightage generation: native TypeScript routes
- Intelligent pytest weightage: Python script invoked only when requested

## Project Structure

- `frontend/app/`
- `frontend/app/api/`
- `frontend/lib/server/`
- `frontend/scripts/weightage.py`
- `node_worker.py`
- `cli.py`
- `core/`
- `uploads/`
- `output/`
- `extracted/`

## Tests

```bash
pytest -q
cd frontend && npm run build
```
