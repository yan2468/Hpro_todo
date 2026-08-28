@echo off
setlocal
REM Build Android debug APK. This script ignores any extra args passed by npm.
cd /d "%~dp0\..\android"
call gradlew.bat assembleDebug
endlocal
