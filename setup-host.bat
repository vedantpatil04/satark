@echo off
title SATARK Host HTTPS Configuration
cd /d "%~dp0"

:: Check for Administrator permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Requesting Administrator privileges to update hosts file and trust Root CA...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup-host-https.ps1"
pause
