from __future__ import annotations

import json
from typing import Any

STACK_INFO: dict[str, Any] = {
    "service": "playwright-json-normalizer",
    "web_stack": "Next.js frontend and Node.js route handlers",
    "python_usage": [
        "core normalization engine",
        "CLI workflows",
        "intelligent pytest weightage analysis",
    ],
    "message": "The web API no longer runs on FastAPI. Start the app from the frontend directory with `npm run dev`.",
}


def get_stack_info() -> dict[str, Any]:
    return STACK_INFO


if __name__ == "__main__":
    print(json.dumps(get_stack_info(), indent=2))
