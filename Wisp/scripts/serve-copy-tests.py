"""Serve PDF-03/04 browser tests with local parsing and no model configuration."""
import sys
from pathlib import Path
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'apps/api'))
from app.config import Settings
with patch('app.config.load_settings', return_value=Settings()):
    from app.main import create_app
from fastapi.staticfiles import StaticFiles
import uvicorn

app = create_app(Settings())
app.mount('/', StaticFiles(directory=root / 'dist', html=True), name='test-ui')
uvicorn.run(app, host='127.0.0.1', port=15310, access_log=False)
