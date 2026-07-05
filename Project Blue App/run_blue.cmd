@echo off
set "PYTHONPATH=%~dp0src"
python -m project_blue %*
exit /b %ERRORLEVEL%
