"""Cloud Run entrypoint for the single-service Wisp deployment."""

import sys
from pathlib import Path

from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.main import app  # noqa: E402


DIST = ROOT / "dist"
if not (DIST / "index.html").is_file():
    raise RuntimeError(f"Missing built frontend at {DIST}")


# API routes are registered before this mount, so /api/* remains handled by FastAPI.
app.mount("/", StaticFiles(directory=str(DIST), html=True), name="web")
