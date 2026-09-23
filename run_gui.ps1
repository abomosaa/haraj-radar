$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[ERROR] Virtual environment not found: .venv\Scripts\python.exe" -ForegroundColor Red
    Write-Host "Create and install with:" -ForegroundColor Yellow
    Write-Host "  py -3.12 -m venv .venv"
    Write-Host "  .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    Write-Host "  .\.venv\Scripts\playwright.exe install chromium"
    exit 1
}

& ".venv\Scripts\python.exe" -c "import PySide6; import playwright.async_api" 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Required dependencies are missing in .venv." -ForegroundColor Red
    Write-Host "Install with:" -ForegroundColor Yellow
    Write-Host "  .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
    Write-Host "  .\.venv\Scripts\playwright.exe install chromium"
    exit 1
}

Write-Host "[INFO] Starting GUI..."
& ".venv\Scripts\python.exe" main.py
exit $LASTEXITCODE
