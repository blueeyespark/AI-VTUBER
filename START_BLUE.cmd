@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_BLUE.ps1" %*
exit /b %ERRORLEVEL%
