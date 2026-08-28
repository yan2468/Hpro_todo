@echo off
cd /d "C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks"
set NODE_OPTIONS=
call npm run build:electron
if errorlevel 1 goto :end
"C:\Users\72980\.workbuddy\binaries\python\versions\3.13.12\python.exe" scripts/package.py
:end
pause
