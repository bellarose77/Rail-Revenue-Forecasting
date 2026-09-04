@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if /I "%~1"=="react" goto :react
if /I "%~1"=="streamlit" goto :streamlit

echo ============================================
echo  Rail Revenue Forecasting Lab - Manual Start
echo ============================================
echo  (for the one-click dashboard launcher, use start.bat instead)
echo.
echo   1. React / Next.js app only
echo   2. Streamlit dashboard only
echo   3. Both (Streamlit here, React in a new window)
echo.
set /p CHOICE="Select an option [1-3, default 1]: "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="1" goto :react
if "%CHOICE%"=="2" goto :streamlit
if "%CHOICE%"=="3" goto :both

echo Invalid selection.
exit /b 1

:both
start "Rail Forecast - React" cmd /k "%~f0" react
goto :streamlit

:react
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing Node dependencies...
  call npm install
  if errorlevel 1 (
    echo Installation failed.
    pause
    exit /b 1
  )
)

echo Starting the React/Next.js dev server...
call :open_when_ready http://127.0.0.1:5173/
call npm run dev
goto :eof

:streamlit
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
call .venv\Scripts\python.exe -m pip install -r dashboard\streamlit\requirements.txt
if errorlevel 1 (
  echo Installation failed.
  pause
  exit /b 1
)

echo Starting the Streamlit dashboard...
call :open_when_ready http://127.0.0.1:8501/
call .venv\Scripts\python.exe -m streamlit run dashboard\streamlit\app.py --server.headless true
goto :eof

:open_when_ready
rem Polls the given URL in the background (hidden window) and opens it in
rem the default browser as soon as the dev server responds, so choosing an
rem option above lands you straight on the dashboard without typing a URL.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='%~1'; for ($i=0; $i -lt 60; $i++) { try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $u; break } catch { Start-Sleep -Seconds 1 } }"
goto :eof
