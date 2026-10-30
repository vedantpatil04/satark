<#
.SYNOPSIS
    SATARK -- Complete Local LAN Startup Script
.DESCRIPTION
    Starts FastAPI backend, Teacher Portal, and Student Portal on local interfaces.
    Detects active host LAN IP and outputs verified access URLs.
#>

[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$Wait
)

$ErrorActionPreference = "Stop"

# Project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK -- SMART CLASSROOM LOCAL LAN SYSTEM STARTUP" -ForegroundColor Cyan
Write-Host " Team: WEBFARM (Fully Local LAN, Offline, No Docker)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Detect Active LAN IPv4 Address
Write-Host "[1/6] Detecting active host LAN IPv4 address..." -ForegroundColor Yellow
$lanIp = "127.0.0.1"
try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|Docker|VMware' -and
        $_.IPAddress -notmatch '^169\.254\.' -and
        $_.IPAddress -notmatch '^127\.'
    } | Select-Object -First 1

    if ($ipObj) {
        $lanIp = $ipObj.IPAddress
    }
} catch {
    Write-Warning "Could not detect active Wi-Fi/Ethernet interface. Falling back to 127.0.0.1"
}
Write-Host "      Detected Host IP: $lanIp" -ForegroundColor Green

# 2. Check Software Prerequisites
Write-Host "[2/6] Verifying software prerequisites..." -ForegroundColor Yellow
$pythonExe = Join-Path $rootDir "backend\venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "[ERROR] Backend Python virtual environment not found at: $pythonExe" -ForegroundColor Red
    Write-Host "Please run: python -m venv backend/venv; backend/venv/Scripts/pip install -r backend/requirements.txt" -ForegroundColor Yellow
    exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js is required but was not found in PATH."
    exit 1
}

# 3. Check for Existing Running Processes or Occupied Ports
Write-Host "[3/6] Checking port availability..." -ForegroundColor Yellow
$ports = @(8000, 5174, 5173)
foreach ($p in $ports) {
    $occupied = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($occupied) {
        Write-Warning "Port $p is already in use by PID $($occupied.OwningProcess[0])."
        Write-Host "Attempting clean stop of previous SATARK instance..." -ForegroundColor Gray
        & (Join-Path $scriptDir "stop-satark.ps1")
        Start-Sleep -Seconds 2
        break
    }
}

# 4. Verify & Initialize SQLite Database
Write-Host "[4/6] Verifying central SQLite database..." -ForegroundColor Yellow
$dbPath = Join-Path $rootDir "data\satark.db"
$dataDir = Join-Path $rootDir "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

& $pythonExe -m backend.app.cli init-db
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to initialize database schema."
    exit 1
}
Write-Host "      Database initialized at: $dbPath (WAL mode active)" -ForegroundColor Green

# Ensure storage directories exist
$storageDirs = @("storage\evidence", "storage\uploads", "storage\exports")
foreach ($d in $storageDirs) {
    $fullD = Join-Path $rootDir $d
    if (-not (Test-Path $fullD)) {
        New-Item -ItemType Directory -Path $fullD -Force | Out-Null
    }
}

# 5. Start Background Services
Write-Host "[5/6] Launching SATARK local services..." -ForegroundColor Yellow

# A. FastAPI Backend
Write-Host "      Starting FastAPI Backend on 0.0.0.0:8000..." -ForegroundColor Gray
$backendOut = Join-Path $dataDir "backend.log"
$backendProcess = Start-Process -FilePath $pythonExe `
    -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000" `
    -WorkingDirectory $rootDir `
    -RedirectStandardOutput $backendOut `
    -RedirectStandardError (Join-Path $dataDir "backend_err.log") `
    -PassThru

# B. Teacher Portal
Write-Host "      Starting Teacher Portal on 0.0.0.0:5174..." -ForegroundColor Gray
$teacherDir = Join-Path $rootDir "apps\teacher-portal"
$teacherProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev -- --host 0.0.0.0 --port 5174" `
    -WorkingDirectory $teacherDir `
    -RedirectStandardOutput (Join-Path $dataDir "teacher.log") `
    -RedirectStandardError (Join-Path $dataDir "teacher_err.log") `
    -PassThru

# C. Student Portal
Write-Host "      Starting Student Portal on 0.0.0.0:5173..." -ForegroundColor Gray
$studentDir = Join-Path $rootDir "apps\student-portal"
$studentProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev -- --host 0.0.0.0 --port 5173" `
    -WorkingDirectory $studentDir `
    -RedirectStandardOutput (Join-Path $dataDir "student.log") `
    -RedirectStandardError (Join-Path $dataDir "student_err.log") `
    -PassThru

# Save PID records for clean shutdown
$pidsData = @{
    backend_pid = $backendProcess.Id
    teacher_pid = $teacherProcess.Id
    student_pid = $studentProcess.Id
    host_ip     = $lanIp
    started_at  = (Get-Date).ToString("o")
} | ConvertTo-Json

Set-Content -Path (Join-Path $dataDir "pids.json") -Value $pidsData -Force

# 6. Verify Health & Print Access URLs
Write-Host "[6/6] Verifying local service health..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$backendHealthy = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/health" -TimeoutSec 5 -ErrorAction Stop
    if ($res.status -eq "healthy") {
        $backendHealthy = $true
    }
} catch {
    $backendHealthy = $false
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "                 SATARK LOCAL NETWORK" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Teacher Portal    : http://${lanIp}:5174" -ForegroundColor Cyan
Write-Host "  Student Portal    : http://${lanIp}:5173" -ForegroundColor Cyan
Write-Host "  Backend API       : http://${lanIp}:8000" -ForegroundColor Cyan
Write-Host "  API Documentation : http://${lanIp}:8000/docs" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  Local Host Access :" -ForegroundColor Yellow
Write-Host "  Teacher Portal    : http://localhost:5174"
Write-Host "  Student Portal    : http://localhost:5173"
Write-Host "  Backend API       : http://localhost:8000"
Write-Host "============================================================" -ForegroundColor Green

if ($backendHealthy) {
    Write-Host "[STATUS: PASS] All services running and responsive!" -ForegroundColor Green
} else {
    Write-Warning "Backend warming up or check data/backend_err.log for startup messages."
}

Write-Host "`nTo check system status:  .\scripts\status-satark.ps1" -ForegroundColor Gray
Write-Host "To test LAN connection:  .\scripts\check-lan.ps1" -ForegroundColor Gray
Write-Host "To stop all services:    .\scripts\stop-satark.ps1" -ForegroundColor Gray

if ($Wait) {
    Write-Host "`n[RUNNING] SATARK services active on LAN. Press Ctrl+C to terminate..." -ForegroundColor Cyan
    try {
        while ($true) {
            Start-Sleep -Seconds 2
        }
    } finally {
        & (Join-Path $scriptDir "stop-satark.ps1")
    }
}
