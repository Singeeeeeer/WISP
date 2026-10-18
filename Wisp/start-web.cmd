@echo off
setlocal
cd /d "%~dp0"
set "PATH=%~dp0runtime\node;%PATH%"
"%~dp0runtime\node\node.exe" "%~dp0node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 15178 --strictPort
