@echo off
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP%\Project Blue 3D.vbs" (
  del "%STARTUP%\Project Blue 3D.vbs"
  echo Project Blue automatic startup is disabled.
) else (
  echo Project Blue automatic startup was already disabled.
)
