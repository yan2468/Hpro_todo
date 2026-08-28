@echo off
setlocal
REM Build Android debug APK. This script ignores any extra args passed by npm.
REM Parent of scripts/ is the project root, which contains /android.
REM (Was: cd /d "%~dp0\..\android" -- the literal ".." in path broke under npm-run)
cd /d "%~dp0..\android"
call gradlew.bat assembleDebug
endlocal
