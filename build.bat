@echo off
cd /d "C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks"
set NODE_OPTIONS=
set PY="C:\Users\72980\.workbuddy\binaries\python\versions\3.13.12\python.exe"

echo ===================================================
echo  Build official release - one click, one version
echo ===================================================

echo.
echo [1/3] Building PC version (Electron exe) ...
call npm run build:electron
if errorlevel 1 (
  echo [ERROR] PC build failed. Check the log above.
  goto :done
)

echo.
echo [2/3] Building Android APK ...
call npm run cap:sync
if errorlevel 1 (
  echo [WARN] cap:sync failed, skip APK (Android SDK missing?).
  goto :package
)
REM Call gradlew directly (skipping the npm-run wrapper).
cd /d "C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks\android"
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo [WARN] APK build failed, skip APK (Android SDK missing?).
  goto :package
)
cd /d "C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks"

:package
echo.
echo [3/3] Packaging official release + cleaning redundant old builds ...
%PY% scripts/build_release.py
if errorlevel 1 (
  echo [WARN] Packaging script error, please check.
)

:done
echo.
echo ===================================================
echo  DONE. Official release is in release\ :
echo    - PC      : NiuMa-DaGongRiZhi-DianNaoBan.zip
echo    - Android : NiuMa-DaGongRiZhi-AnZhuoBan.apk
echo    - Server  : dave-tasks-server.zip
echo  Old "xiufu/fix" builds moved to release\_archive\ (safe backup)
echo ===================================================
pause
