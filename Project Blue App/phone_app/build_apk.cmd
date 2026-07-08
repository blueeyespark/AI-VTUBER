@echo off
setlocal
cd /d "%~dp0"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
gradle.bat assembleDebug
if errorlevel 1 exit /b %errorlevel%
echo.
echo APK ready:
echo %CD%\app\build\outputs\apk\debug\app-debug.apk
