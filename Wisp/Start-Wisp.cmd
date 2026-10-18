@echo off
setlocal
cd /d "%~dp0"
"%~dp0runtime\python\python.exe" -I "%~dp0launch.py"
if errorlevel 1 pause
