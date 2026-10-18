"""Build a private handoff; never print or embed credentials in source/logs."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--python-home', required=True)
    parser.add_argument('--node-home', required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT / 'apps/api'))
    from app.config import load_settings
    settings = load_settings({'WISP_ENV_FILE': args.env_file})
    if not settings.configured:
        raise SystemExit('Source configuration is not usable; no archive created.')
    if any('\n' in x or '\r' in x or '"' in x for x in [settings.api_key, settings.model, settings.api_version]):
        raise SystemExit('Unsupported configuration encoding; no archive created.')
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    release = ROOT / 'releases' / ('Wisp-Windows-private-' + stamp)
    project = release / 'Wisp'
    release.mkdir(parents=True, exist_ok=False)
    def ignore(directory, names):
        return [n for n in names if n in {'.git','.venv','.npm-cache','__pycache__','.pytest_cache','test-results','playwright-report','coverage','releases'} or (n.startswith('.env') and n != '.env.example') or n.endswith('.log')]
    shutil.copytree(ROOT, project, ignore=ignore)
    runtime = project / 'runtime'
    python_home = Path(args.python_home)
    dest = runtime / 'python'
    dest.mkdir(parents=True)
    for name in ['python.exe','pythonw.exe','python3.dll','python311.dll','vcruntime140.dll','vcruntime140_1.dll','LICENSE.txt']:
        shutil.copy2(python_home / name, dest / name)
    for name in ['DLLs','Lib','tcl']:
        shutil.copytree(python_home / name, dest / name, ignore=lambda d,ns:[n for n in ns if n in {'site-packages','__pycache__'}])
    shutil.copytree(ROOT / '.venv/Lib/site-packages', dest / 'Lib/site-packages', ignore=lambda d,ns:[n for n in ns if n == '__pycache__'])
    shutil.copytree(Path(args.node_home), runtime / 'node')
    # Write only the Gemini settings needed by Wisp, not unrelated old-project secrets.
    values = {'GEMINI_API_KEY':settings.api_key,'GEMINI_MODEL':settings.model,'GEMINI_API_VERSION':settings.api_version,'GEMINI_TIMEOUT_SECONDS':str(settings.timeout)}
    (project / '.env').write_text(''.join(k + '=“' + v + '”\n' for k,v in values.items()).replace('“','"').replace('”','"'), encoding='utf-8')
    shutil.copy2(ROOT / 'scripts/wisp_portable_launcher.py', project / 'launch.py')
    (project / 'Start-Wisp.cmd').write_text('@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\python\\python.exe" -I "%~dp0launch.py"\r\nif errorlevel 1 pause\r\n',encoding='ascii')
    (project / 'start-web.cmd').write_text('@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "PATH=%~dp0runtime\\node;%PATH%"\r\n"%~dp0runtime\\node\\node.exe" "%~dp0node_modules\\vite\\bin\\vite.js" --host 127.0.0.1 --port 15178 --strictPort\r\n',encoding='ascii')
    (project / 'start-api.cmd').write_text('@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "WISP_ENV_FILE=%~dp0.env"\r\n"%~dp0runtime\\python\\python.exe" -I -m uvicorn app.main:app --app-dir "%~dp0apps\\api" --host 127.0.0.1 --port 15179 --no-access-log\r\n',encoding='ascii')
    (project / 'START-HERE.txt').write_text("Wisp handoff package · Windows 10/11 x64\n\n1. Extract the entire ZIP to a regular folder. Do not run it from inside the archive.\n2. Open the Wisp folder and double-click Start-Wisp.cmd.\n3. Wait for your browser to open. If it does not, visit http://127.0.0.1:15278/ .\n4. Keep the launcher window open. Press Ctrl+C in that window to stop the service.\n\nPython, Node and the dependencies are included. No developer tools need to be installed. Use an existing copy of Chrome or Edge.\nDo not open dist/index.html directly. Do not start start-web.cmd or start-api.cmd separately.\n\nUsing Gemini\nThis private handoff has Gemini configured. The local server reads the key; you do not need to copy a key from chat.\nStarting Wisp or selecting Gemini does not call the model. A model request is sent only after you explicitly run or delegate an operation. It requires internet access and uses the shared account quota.\n\n1. Open “Bookstore event proposal” or create your own document.\n2. Select some text. To process the full document, click in the text and clear the selection.\n3. Right-click in the document or use the trackpad's secondary click, then choose Understand, Check or Create. You can also use the Core abilities button.\n4. Confirm the material, select Gemini as the execution mode, then click the action button.\n   Understand organizes a summary (Brief or Standard); Check reviews potential issues; Create drafts new text.\n5. Review the result in the small panel. You can copy or close it; Create also supports copying only the draft.\n6. To delegate a task, choose Summon and select a familiar:\n   Scout Bat: review;\n   Page Sprite: summarize;\n   Alchemy Imp: draft.\n   Confirm Gemini as the execution mode, then click Summon familiar. Read the reply from View familiar tasks.\n7. You can also choose Summon familiar again from a result. Confirm again before it runs. It uses the original material, not model-generated text.\n\nThings to remember\nNew operations use local processing by default. Switching familiars returns to local mode; check the execution mode before submitting.\nLocal mode remains available without Gemini. Model results never rewrite the source automatically and do not trigger Watch invitations.\nFamiliar tasks depend on the current page. Do not refresh or close it before they finish. Interrupted tasks are not restarted automatically; a request already sent may still use quota.\nTrackpad secondary click must be enabled in your system settings; it is not a two-finger scroll.\nResults and text are stored in this browser at this URL. The package does not include the sender's personal browser materials.\nDatabase version 9 retains old data. If you used this URL before, copy important text, finish active tasks and close old pages before opening the new version. Do not clear browser data.\nDo not use an older ZIP with the same upgraded database. Switching browsers or ports will not move your data.\n\nTroubleshooting\nPage does not open: check that the archive was fully extracted and the launcher window is still open, then revisit the URL above.\nPort is busy: close a Wisp window you started earlier. Do not stop an unknown process.\nGemini failed: check internet access and account quota. Share the visible error text with the team; never share .env contents.\n“Retry saving result” appears: retry the save only. This does not call the model again. Do not refresh yet.\nTo restart: double-click Start-Wisp.cmd again and use the same browser and URL.\n\nPrivate package and validation scope\nThis package contains real Gemini configuration in Wisp/.env. Only share it with the intended teammate; anyone holding the file can read the key. Do not upload it to GitHub or a public drive.\nOnly Wisp's required Gemini configuration is included; settings from other projects are not copied.\nUsers have reported manually validating Gemini flows for all three core abilities and familiars. This package build does not make additional model requests.\nA local extraction and startup check does not mean every teammate's computer has been validated. Historical offline tests and user feedback are documented under docs.\nSource instructions remain in README.md and may refer to the original development machine. For this portable package, follow this file first.\n",encoding='utf-8-sig')
    manifest = {'platform':'Windows x64','contains_private_gemini_config':True,'auto_model_calls':False,'browser_data_included':False,'entry':'Wisp/Start-Wisp.cmd','url':'http://127.0.0.1:15278/'}
    (project / 'PACKAGE-INFO.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    archive = release.with_suffix('.zip')
    count = 0
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in project.rglob('*'):
            if p.is_file():
                z.write(p,p.relative_to(release))
                count += 1
    digest = hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
    archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n',encoding='ascii')
    print(json.dumps({'archive':str(archive),'stage':str(release),'files':count,'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=True),flush=True)

if __name__ == '__main__':
    main()
