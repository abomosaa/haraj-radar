@echo off
rem Run the FastAPI backend from the project root.
cd /d "%~dp0.."
uvicorn server.app:app --port 8000
