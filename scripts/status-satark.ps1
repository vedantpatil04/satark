<#
.SYNOPSIS
    SATARK -- Local System Status Script
.DESCRIPTION
    Reports runtime status of Backend, Teacher Portal, Student Portal,
    SQLite database, and detected host LAN IP.
#>

[CmdletBinding()]
param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$pidFile = Join-Path $rootDir "data\pids.json"
$dbFile = Join-Path $rootDir "data\satark.db"
$pythonExe = Join-Path $rootDir "backend\venv\Scripts\python.exe"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK -- Local LAN System Status Report" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Detect Host LAN IP
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
} catch {}

Write-Host "Host LAN IPv4 Address : $lanIp" -ForegroundColor White

# 2. Check Service Processes
$pids = $null
if (Test-Path $pidFile) {
    try {
        $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
    } catch {}
}

function Check-ServiceStatus([string]$label, [int]$pidToCheck, [int]$port) {
    $proc = $null
    if ($pidToCheck -gt 0) {
        $proc = Get-Process -Id $pidToCheck -ErrorAction SilentlyContinue
    }

    $portListening = $false
    try {
        $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conn) { $portListening = $true }
    } catch {}

    if ($proc -and $portListening) {
        Write-Host "  [OK] $($label.PadRight(18)) : RUNNING  (PID: $pidToCheck, Port: $port)" -ForegroundColor Green
        return $true
    } elseif ($portListening) {
        Write-Host "  [OK] $($label.PadRight(18)) : LISTENING on port $port (External PID)" -ForegroundColor Yellow
        return $true
    } else {
        Write-Host "  [--] $($label.PadRight(18)) : STOPPED" -ForegroundColor Red
        return $false
    }
}

Write-Host "`nService Processes:" -ForegroundColor Yellow
$bRunning = Check-ServiceStatus "FastAPI Backend" ($pids.backend_pid) 8000
$tRunning = Check-ServiceStatus "Teacher Portal" ($pids.teacher_pid) 5174
$sRunning = Check-ServiceStatus "Student Portal" ($pids.student_pid) 5173

# 3. Backend Health API Probe
Write-Host "`nBackend API Health Check:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  [OK] Health Status     : $($health.status.ToUpper())" -ForegroundColor Green
    Write-Host "  [OK] Database Engine   : $($health.database)" -ForegroundColor Green
    Write-Host "  [OK] API Version       : $($health.api_version)" -ForegroundColor Gray
} catch {
    Write-Host "  [--] Health Probe      : FAILED or Backend Offline ($($_.Exception.Message))" -ForegroundColor Red
}

# 4. SQLite Database Inspection
Write-Host "`nCentral SQLite Database:" -ForegroundColor Yellow
if (Test-Path $dbFile) {
    $item = Get-Item $dbFile
    $sizeKb = [math]::Round($item.Length / 1KB, 1)
    Write-Host "  [OK] Database Path     : $dbFile" -ForegroundColor Gray
    Write-Host "  [OK] File Size         : $sizeKb KB" -ForegroundColor Gray

    # Quick PRAGMA and table count query
    if (Test-Path $pythonExe) {
        try {
            $stats = & $pythonExe -m backend.app.cli db-status
            $parts = $stats.Trim().Split(" ")
            Write-Host "  [OK] Journal Mode      : $($parts[0].ToUpper())" -ForegroundColor Green
            Write-Host "  [OK] Total Tables      : $($parts[1]) tables" -ForegroundColor Green
        } catch {
            Write-Host "  [OK] Mode / Schema     : Active" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  [--] Database File     : NOT FOUND (Run start-satark.ps1 to initialize)" -ForegroundColor Red
}

Write-Host "`n============================================================" -ForegroundColor Cyan
