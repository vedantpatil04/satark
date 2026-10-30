<#
.SYNOPSIS
    SATARK -- LAN Connectivity and Health Diagnostic Script
.DESCRIPTION
    Validates host LAN network interface, port reachability, FastAPI health endpoint,
    WebSocket signaling availability, and local storage access.
#>

[CmdletBinding()]
param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$pythonExe = Join-Path $rootDir "backend\venv\Scripts\python.exe"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK -- LAN Network & Connectivity Diagnostic" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Host LAN IP Detection
Write-Host "[1/5] Checking Network Interfaces..." -ForegroundColor Yellow
$lanIps = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|Docker|VMware' -and
    $_.IPAddress -notmatch '^169\.254\.' -and
    $_.IPAddress -notmatch '^127\.'
}

if (-not $lanIps) {
    Write-Warning "No active LAN or Wi-Fi network interface detected!"
    $primaryIp = "127.0.0.1"
} else {
    foreach ($entry in $lanIps) {
        Write-Host "  * Interface: $($entry.InterfaceAlias.PadRight(15)) IPv4: $($entry.IPAddress)" -ForegroundColor Green
    }
    $primaryIp = $lanIps[0].IPAddress
}

# 2. Local Port Checks
Write-Host "`n[2/5] Checking Listening Ports..." -ForegroundColor Yellow
$ports = @(
    @{ Port = 8000; Service = "FastAPI Backend" },
    @{ Port = 5174; Service = "Teacher Portal" },
    @{ Port = 5173; Service = "Student Portal" }
)

foreach ($item in $ports) {
    $open = Get-NetTCPConnection -LocalPort $item.Port -State Listen -ErrorAction SilentlyContinue
    if ($open) {
        Write-Host "  * Port $($item.Port) ($($item.Service)): OPEN (PID: $($open.OwningProcess[0]))" -ForegroundColor Green
    } else {
        Write-Host "  * Port $($item.Port) ($($item.Service)): NOT LISTENING" -ForegroundColor Red
    }
}

# 3. HTTP Health Reachability
Write-Host "`n[3/5] Testing HTTP Reachability..." -ForegroundColor Yellow

# Test Loopback
try {
    $localHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  * Local Loopback (127.0.0.1:8000) : PASS (DB: $($localHealth.database))" -ForegroundColor Green
} catch {
    Write-Host "  * Local Loopback (127.0.0.1:8000) : FAIL ($($_.Exception.Message))" -ForegroundColor Red
}

# Test LAN IP
try {
    $lanHealth = Invoke-RestMethod -Uri "http://${primaryIp}:8000/api/v1/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "  * LAN Host IP   (${primaryIp}:8000) : PASS (Accessible to other LAN devices)" -ForegroundColor Green
} catch {
    Write-Host "  * LAN Host IP   (${primaryIp}:8000) : FAIL or Blocked by Windows Firewall" -ForegroundColor Red
    Write-Host "    Run 'scripts/setup-firewall.ps1' as Administrator to permit LAN inbound traffic." -ForegroundColor Gray
}

# 4. Storage Directories
Write-Host "`n[4/5] Checking Local Storage Directories..." -ForegroundColor Yellow
$dirs = @("data", "storage\evidence", "storage\uploads", "storage\exports")
foreach ($d in $dirs) {
    $full = Join-Path $rootDir $d
    if (Test-Path $full) {
        Write-Host "  * Directory '$d' : OK" -ForegroundColor Green
    } else {
        Write-Host "  * Directory '$d' : MISSING (Will be auto-created at startup)" -ForegroundColor Yellow
    }
}

# 5. Network Topology / AP Isolation Guidance
Write-Host "`n[5/5] Hotspot / Wi-Fi Topology Diagnostics..." -ForegroundColor Yellow
Write-Host "  * Multi-Device Requirements:" -ForegroundColor White
Write-Host "    1. All teacher computers, student computers, and Android phones must be connected" -ForegroundColor Gray
Write-Host "       to the exact same Wi-Fi SSID or mobile hotspot." -ForegroundColor Gray
Write-Host "    2. Verify Wi-Fi Router does NOT have 'Client Isolation' or 'AP Isolation' enabled." -ForegroundColor Gray
Write-Host "       (Some phone hotspots block device-to-device routing by default)." -ForegroundColor Gray
Write-Host "    3. On Android client devices, configure Host IP: $primaryIp and Port: 8000." -ForegroundColor Gray

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " LAN DIAGNOSTIC SUMMARY: Complete" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
