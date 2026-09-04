@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Rail Revenue Forecasting Lab - Build
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  exit /b 1
)

rem This project's npm build/lint scripts shell out to Git Bash. Git for
rem Windows does not always add it to PATH, so fall back to the default
rem install location if "bash" isn't already resolvable.
where bash >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\Git\bin\bash.exe" (
    set "PATH=%ProgramFiles%\Git\bin;%PATH%"
  ) else if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" (
    set "PATH=%ProgramFiles(x86)%\Git\bin;%PATH%"
  )
)
where bash >nul 2>nul
if errorlevel 1 (
  echo This project's build script requires Git Bash ^(bash.exe^), which was
  echo not found on PATH or in the default Git for Windows install location.
  echo Install Git for Windows from https://git-scm.com/download/win and
  echo re-run build.bat.
  exit /b 1
)

echo Installing Node dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  exit /b 1
)

echo.
echo Building the React/Next.js application...
call npm run build
if errorlevel 1 (
  echo npm run build failed.
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python not found - skipping Streamlit environment setup.
  goto :done
)

if not exist .venv\Scripts\python.exe (
  echo.
  echo Creating Python environment...
  py -m venv .venv
)

echo.
echo Installing Streamlit dashboard dependencies...
call .venv\Scripts\python.exe -m pip install --upgrade pip
call .venv\Scripts\python.exe -m pip install -r dashboard\streamlit\requirements.txt
if errorlevel 1 (
  echo pip install failed.
  exit /b 1
)

:done
echo.
echo Build complete.
