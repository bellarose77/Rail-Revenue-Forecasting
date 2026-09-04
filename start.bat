@echo off
rem One-click launcher for the Rail Revenue Forecasting Dashboard (Streamlit).
rem No menu, no typing required: double-click this file and the dashboard
rem starts and opens in your default browser. The console window that
rem briefly appears here closes on its own once the dashboard is open;
rem the dashboard itself keeps running in the background.
rem
rem This calls scripts\windows\launch-dashboard.ps1, which does the actual
rem work (Python venv, dependency install, port/duplicate checks, waiting
rem for readiness, opening the browser) and reports any failure in a
rem Windows message box instead of a console window that can vanish
rem before you can read it.
rem
rem If you specifically want to choose React vs. Streamlit vs. both, use
rem start-menu.bat instead -- it has the old interactive menu.

setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\launch-dashboard.ps1"
exit /b %ERRORLEVEL%
