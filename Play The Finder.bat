@echo off
rem Play The Finder: builds the site and runs it on your own PC, then opens it in your browser.
rem Double-click this file. Leave the black window open while you play; close it to stop.
rem The first start can take a few seconds while the site is built.
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo.
  echo The build failed. Scroll up to read why.
  pause
  exit /b 1
)
rem Open the browser a moment after the server starts.
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:4173/play/"
call npm run preview -- --port 4173 --strictPort
pause
