"""Local-only launcher for the private Windows handoff archive."""
import argparse
import os
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
if ROOT.name == 'scripts':
    ROOT = ROOT.parent

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=15278)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--config', type=Path, default=ROOT / '.env',
                        help='Server configuration file; defaults to this copy of Wisp/.env.')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise SystemExit('Invalid local port.')
    if not (ROOT / 'dist/index.html').is_file():
        raise SystemExit('Missing dist folder. Extract the complete ZIP first.')
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', args.port))
        except OSError:
            raise SystemExit('Port is occupied. Close the previous Wisp launcher, or choose --port. No process was stopped.')
    config = args.config.expanduser().resolve()
    os.environ['WISP_ENV_FILE'] = str(config)
    sys.path.insert(0, str(ROOT / 'apps/api'))
    import uvicorn
    from app.config import load_settings
    from app.main import create_app
    from fastapi.staticfiles import StaticFiles
    # Isolate this archive's server config from unrelated machine environment values.
    settings = load_settings({'WISP_ENV_FILE': str(config)})
    app = create_app(settings)
    app.mount('/', StaticFiles(directory=str(ROOT / 'dist'), html=True), name='web')
    url = 'http://127.0.0.1:' + str(args.port)
    print('Wisp: ' + url, flush=True)
    print('Gemini configuration: ' + ('ready' if settings.configured else 'missing; local mode remains available'), flush=True)
    print('Keep this window open. Press Ctrl+C here to stop. No model request is made on startup.', flush=True)
    if not args.no_browser:
        def open_when_ready():
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            for _ in range(80):
                try:
                    with opener.open(url + '/api/health', timeout=1) as response:
                        if response.status == 200:
                            webbrowser.open(url)
                            return
                except Exception:
                    time.sleep(0.25)
        threading.Thread(target=open_when_ready, daemon=True).start()
    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False, log_level='warning')

if __name__ == '__main__':
    main()
