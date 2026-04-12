@echo off
title SiteIQ — Site Readiness Analyzer

echo.
echo  ==============================================
echo   SiteIQ ^— Starting Application
echo  ==============================================
echo.

:: Kill any leftover processes on port 8001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start the FastAPI backend in a new window
echo  [1/3] Starting Backend API on http://localhost:8001 ...
start "SiteIQ Backend" cmd /k "cd /d %~dp0 && python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload"

:: Start the React frontend in a new window
echo  [2/3] Starting React Frontend on http://localhost:5173 ...
start "SiteIQ Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait until backend is actually ready (poll port 8001)
echo.
echo  [3/3] Waiting for backend to finish loading...
echo        (This takes ~30-60 seconds on first run)
echo.
:wait_loop
timeout /t 3 /nobreak > nul
curl -s http://localhost:8001/stats > nul 2>&1
if errorlevel 1 (
    <nul set /p="."
    goto wait_loop
)

echo.
echo  Backend is READY! Opening browser...
start http://localhost:5173

echo.
echo  ==============================================
echo   All servers are running!
echo  ==============================================
echo.
echo   Website     : http://localhost:5173
echo   API Docs    : http://localhost:8001/docs
echo   Database    : NeonDB Cloud (Site_IQ)
echo.
echo  ==============================================
echo.
echo  Close the Backend and Frontend windows to stop.
pause
