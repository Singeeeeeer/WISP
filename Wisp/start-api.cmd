@echo off
setlocal
cd /d "%~dp0"
set "WISP_ENV_FILE=%~dp0.env"
"%~dp0runtime\python\python.exe" -I -m uvicorn app.main:app --app-dir "%~dp0apps\api" --host 127.0.0.1 --port 15179 --no-access-log
