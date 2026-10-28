@echo off
setlocal
cd /d "%~dp0"

start "Skill Exchange Platform" cmd /k "cd /d ""%~dp0"" && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:8080/index.html"
