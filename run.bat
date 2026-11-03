@echo off
title SATARK Launcher (HTTPS and LAN Ready)
echo ============================================================
echo   SATARK - Starting All Services (HTTPS and LAN Enabled)
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting FastAPI Backend on port 8000 with HTTPS...
start "SATARK Backend (Port 8000)" cmd /k "backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile certs\key.pem --ssl-certfile certs\cert.pem --reload"

ping 127.0.0.1 -n 3 >nul

echo [2/3] Starting Teacher Portal on port 5174 with HTTPS...
start "SATARK Teacher Portal (Port 5174)" cmd /k "npm run dev:teacher"

echo [3/3] Starting Student Portal on port 5173 with HTTPS...
start "SATARK Student Portal (Port 5173)" cmd /k "npm run dev:student"

ping 127.0.0.1 -n 4 >nul

echo.
echo ============================================================
echo   SATARK Services Running with Trusted HTTPS:
echo   - Teacher Portal:  https://satark.test:5174
echo   - Student Portal:  https://satark.test:5173
echo   - Backend API:     https://satark.test:8000
echo   - API Docs:        https://satark.test:8000/docs
echo.
echo   LAN IP Alternative (Same Network):
echo   - Teacher Portal:  https://10.146.60.105:5174
echo   - Student Portal:  https://10.146.60.105:5173
echo   - Backend API:     https://10.146.60.105:8000
echo   - API Docs:        https://10.146.60.105:8000/docs
echo   (Also supports https://satark.local:5174 and :5173)
echo ============================================================
echo Opening browser...
start https://satark.test:5174
start https://satark.test:5173
