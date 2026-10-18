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
    (project / 'START-HERE.txt').write_text('''Wisp 队友使用包（Windows x64）

1. 先把整个 ZIP 解压到一个文件夹。不要在压缩软件里面直接运行。
2. 打开 Wisp 文件夹，双击 Start-Wisp.cmd。
3. 它会启动本机服务并打开浏览器；没自动打开就访问 http://127.0.0.1:15278/ 。
4. 保持启动窗口打开。在该窗口按 Ctrl+C 停止服务。

不用先安装 Python、Node 或依赖；包内已带运行环境。需要 Windows 10/11 x64 和现代浏览器（推荐已有 Chrome/Edge）。本轮只验证本机重新解压启动，不等于所有电脑都验收过。

选中文字或定位文档 → 双指辅助点按/右键 → Check → 确认材料。默认本地；选择 Gemini 并提交才会发模型请求。也可用 Summon → Scout Bat。结果可复制/关闭/继续召唤，继续召唤仍需确认。

这个私密包含真实 Gemini 凭据，位于 .env，仅本机服务端读取，不会作为网页文件提供。请只发给指定队友，不要上传到 GitHub 或公开网盘。使用 Gemini 需要联网并会使用该凭据所属账号的配额，启动本身不调用模型。

材料和回信保存在你自己的浏览器中。这个包包含源码、依赖、构建网页和文档，不包含发送者浏览器中的个人材料。首次打开会看到示例；关闭或刷新页面会中断未完成委托。固定用上述网址，换端口/浏览器会进入另一份本地存储。

如果端口被占用，先关闭之前自己启动的 Wisp 窗口，不要结束未知程序。启动错误会留在窗口里，发错误文字给队友即可，不要发送 .env 内容。

开发者：源码、测试、文档、node_modules 与 runtime/node 已保留。start-web.cmd/start-api.cmd 是可携带的开发入口，分别用15178/15179；普通使用只需 Start-Wisp.cmd（15278单服务）。这些端口对应不同浏览器数据，勿混淆。

更详细说明见 README.md；其中本机原开发路径仅供参考，本包优先按本文件启动。
''',encoding='utf-8-sig')
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
