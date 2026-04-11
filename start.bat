@echo off
title SiteIQ — Site Readiness Analyzer

echo.
echo  ==============================================
echo   SiteIQ — Starting Application
echo  ==============================================
echo.

:: Start the FastAPI backend in a new window
echo  [1/3] Starting Backend API on http://localhost:8000 ...
start "SiteIQ Backend" cmd /k "cd /d %~dp0 && python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload"
:: Small pause to let backend initialize
timeout /t 3 /nobreak > nul

:: Start the React frontend in a new window
echo  [2/3] Starting React Frontend on http://localhost:5173 ...
start "SiteIQ Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Open browser tabs after a short delay
echo.
echo  [3/3] Opening browser tabs...
timeout /t 4 /nobreak > nul
start http://localhost:5173
start http://localhost:8001/admin/db

echo.
echo  ==============================================
echo   All servers are running!
echo  ==============================================
echo.
echo   Website     : http://localhost:5173
echo   DB Admin    : http://localhost:8001/admin/db
echo   API Docs    : http://localhost:8001/docs
echo   Database    : %~dp0geoanalyst.db
echo.
echo  ==============================================
echo.
echo  Close the Backend and Frontend windows to stop.
pause
