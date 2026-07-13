@echo off
setlocal
set "BLUE_APP=%~dp0Project Blue App"
if not exist "%BLUE_APP%\run_blue.cmd" (
  echo Project Blue launcher not found at "%BLUE_APP%\run_blue.cmd" 1>&2
  exit /b 2
)
pushd "%BLUE_APP%"
call ".\run_blue.cmd" %*
set "BLUE_EXIT=%ERRORLEVEL%"
popd
exit /b %BLUE_EXIT%
