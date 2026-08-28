@echo off
cd /d "C:\Users\72980\WorkBuddy\2026-08-17-09-13-57\dave-diver-tasks"
set NODE_OPTIONS=
call npm run cap:sync
if errorlevel 1 goto :end
call npm run apk:debug
:end
pause
