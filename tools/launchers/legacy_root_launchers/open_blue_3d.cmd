@echo off
pushd "%~dp0Project Blue App\desktop_pet"
set "ELECTRON_RUN_AS_NODE="
call npm.cmd start
set "BLUE_EXIT=%ERRORLEVEL%"
popd
exit /b %BLUE_EXIT%
