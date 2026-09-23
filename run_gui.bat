@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Virtual environment not found: .venv\Scripts\python.exe
  echo Create and install with:
  echo   py -3.12 -m venv .venv
  echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  echo   .\.venv\Scripts\playwright.exe install chromium
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -c "import PySide6; import playwright.async_api" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Required dependencies are missing in .venv.
  echo Install with:
  echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  echo   .\.venv\Scripts\playwright.exe install chromium
  pause
  exit /b 1
)

echo [INFO] Starting GUI...
".venv\Scripts\python.exe" main.py
set "APP_EXIT_CODE=%ERRORLEVEL%"

if not "%APP_EXIT_CODE%"=="0" (
  echo [ERROR] Application exited with code %APP_EXIT_CODE%.
  pause
)

exit /b %APP_EXIT_CODE%
