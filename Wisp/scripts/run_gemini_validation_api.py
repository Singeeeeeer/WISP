"""Local validation server; never prints configuration values."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'apps'/'api'))
from app.config import load_settings
from app.main import create_app
import uvicorn
parser=argparse.ArgumentParser()
parser.add_argument('--config',required=True)
args=parser.parse_args()
settings=load_settings({'WISP_ENV_FILE':args.config})
if not settings.configured:
    print('Validation configuration unavailable');sys.exit(1)
uvicorn.run(create_app(settings),host='127.0.0.1',port=15189,access_log=False,log_level='warning')
