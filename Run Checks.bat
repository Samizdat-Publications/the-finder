@echo off
rem Run Checks: runs the automatic tests for The Finder, then shows the results.
rem Double-click this file. When it finishes, Notepad opens with the report (harness\LAST_RUN.md).
rem If the report says PASS everywhere, nothing is broken.
cd /d "%~dp0"
call npm run check
if exist "harness\LAST_RUN.md" start notepad "harness\LAST_RUN.md"
pause
