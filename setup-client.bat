@echo off
title SATARK Client PC Setup
cd /d "%~dp0"

set HOST_IP=%~1
if "%HOST_IP%"=="" (
    set HOST_IP=10.146.60.105
)

:: Check for Administrator permissions
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Requesting Administrator privileges to update hosts file and trust Root CA...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\" %HOST_IP%\"' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup-client-pc.ps1" -HostIP "%HOST_IP%"
pause
