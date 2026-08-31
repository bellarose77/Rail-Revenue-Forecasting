@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 or newer is required.
  pause
  exit /b 1
)

if not exist .venv\Scripts\python.exe (
  echo Creating Python environment...
  py -m venv .venv
)

echo Installing Streamlit dependencies...
call .venv\Scripts\python.exe -m pip install -r streamlit_app\requirements.txt
if errorlevel 1 (
  echo Installation failed.
  pause
  exit /b 1
)

echo Starting the Streamlit forecast lab...
call .venv\Scripts\python.exe -m streamlit run streamlit_app\app.py
