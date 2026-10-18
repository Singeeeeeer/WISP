"""Extract and run a private archive without invoking any model."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',required=True)
    parser.add_argument('--destination',required=True)
    args=parser.parse_args()
    destination=Path(args.destination).resolve()
    destination.mkdir(parents=True,exist_ok=False)
    with zipfile.ZipFile(args.archive) as z:
        if z.testzip() is not None: raise RuntimeError('ZIP integrity failure')
        for name in z.namelist():
            if not (destination/name).resolve().is_relative_to(destination): raise RuntimeError('Invalid archive path')
        z.extractall(destination)
    project=destination/'Wisp'
    env=dict(os.environ)
    for name in ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','WISP_ENV_FILE','GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_MODEL']:
        env.pop(name,None)
    env['PATH']=str(Path(os.environ['SystemRoot'])/'System32')
    runtime=project/'runtime/python/python.exe'
    node=project/'runtime/node/node.exe'
    python_version=subprocess.check_output([str(runtime),'-I','--version'],env=env,text=True).strip()
    node_version=subprocess.check_output([str(node),'--version'],env=env,text=True).strip()
    port=15289
    server=subprocess.Popen([str(runtime),'-I',str(project/'launch.py'),'--no-browser','--port',str(port)],cwd=project,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base='http://127.0.0.1:'+str(port)
    try:
        health=None
        for _ in range(100):
            if server.poll() is not None: raise RuntimeError('Packaged server exited; no credential output captured')
            try:
                with opener.open(base+'/api/health',timeout=1) as response: health=json.load(response)
                break
            except (urllib.error.URLError,TimeoutError): time.sleep(.1)
        if not health or health.get('model_status')!='configured': raise RuntimeError('Packaged configuration not ready')
        with opener.open(base,timeout=5) as response: html=response.read().decode()
        assets=re.findall(r'(?:src|href)="(/assets/[^"]+)"',html)
        if not assets: raise RuntimeError('No built web assets')
        for asset in assets:
            with opener.open(base+asset,timeout=5) as response:
                if response.status!=200: raise RuntimeError('Asset failed')
        protected=['/.env','/runtime/python/python.exe','/apps/api/app/config.py']
        for path in protected:
            try:
                opener.open(base+path,timeout=5)
                raise RuntimeError('Private file is exposed')
            except urllib.error.HTTPError as error:
                if error.code!=404: raise
        check_script=ROOT/'scripts/verify_private_browser.cjs'
        browser_result=subprocess.check_output([str(node),str(check_script),base],cwd=ROOT,env=env,text=True)
        report={'zip_integrity':'passed','relocated_runtime':True,'python':python_version,'node':node_version,'health':health,'static_assets':len(assets),'private_http_paths':'404','browser':json.loads(browser_result),'live_model_calls':0}
        report_path=Path(args.archive).with_suffix('.verification.json')
        report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(report,ensure_ascii=True))
    finally:
        if server.poll() is None:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired: server.kill();server.wait(timeout=5)

if __name__=='__main__': main()
