@echo off
setlocal
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "FOUND=0"

for %%F in ("Project Blue 3D.vbs" "Project Blue.vbs" "START_BLUE_HIDDEN.vbs" "start_blue_hidden.vbs") do (
  if exist "%STARTUP%\%%~F" (
    del "%STARTUP%\%%~F"
    echo Removed %%~F from Windows Startup.
    set "FOUND=1"
  )
)

if "%FOUND%"=="0" echo Project Blue automatic startup was already disabled.
exit /b 0
