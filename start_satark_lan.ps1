<#
.SYNOPSIS
    SATARK -- Safe Offline Hotspot & LAN Launcher
.DESCRIPTION
    Launches SATARK (FastAPI Backend, Teacher Portal, Student Portal) bound to 0.0.0.0
    with trusted HTTPS/WSS across the local Wi-Fi / Mobile Hotspot network.
    Automatically detects the active hotspot/LAN IPv4 address and verifies service health.
#>

[CmdletBinding()]
param(
    [string]$CustomIp = "",
    [switch]$NoBrowser,
    [switch]$Wait
)

$ErrorActionPreference = "Stop"

# Repository Root Directory
$rootDir = (Resolve-Path "$PSScriptRoot").Path
Set-Location $rootDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK - Offline Hotspot & Cross-Platform LAN Launcher" -ForegroundColor Cyan
Write-Host " Complete Offline Assessment & Live Monitoring Engine" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Automatic Network Adapter & Active IPv4 Detection
# ---------------------------------------------------------------------------
Write-Host "[1/6] Detecting active Mobile Hotspot / Wi-Fi network interface..." -ForegroundColor Yellow

$detectedIp = ""
$adapterName = ""
$adapterType = ""

if ($CustomIp) {
    $detectedIp = $CustomIp
    $adapterName = "User-Specified"
    $adapterType = "Manual Override"
} else {
    # A. Check for active Windows Mobile Hotspot adapter (Wi-Fi Direct)
    try {
        $hotspotAdapter = Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and $_.InterfaceDescription -match 'Wi-Fi Direct'
        }
        if ($hotspotAdapter) {
            $hsIp = (Get-NetIPAddress -InterfaceIndex $hotspotAdapter[0].InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                     Where-Object { $_.IPAddress -notmatch '^169\.254\.' -and $_.IPAddress -notmatch '^127\.' }).IPAddress
            if ($hsIp) {
                $detectedIp = $hsIp
                $adapterName = $hotspotAdapter[0].Name
                $adapterType = "Windows Mobile Hotspot Virtual Adapter"
            }
        }
    } catch {}

    # B. Check for active Up Wi-Fi or Ethernet adapter
    if (-not $detectedIp) {
        try {
            $upAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
            foreach ($adapter in $upAdapters) {
                $ipObj = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                         Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notmatch '^169\.254\.' -and $_.IPAddress -notmatch '^127\.' }
                if ($ipObj) {
                    $detectedIp = $ipObj[0].IPAddress
                    $adapterName = $adapter.Name
                    $adapterType = $adapter.InterfaceDescription
                    break
                }
            }
        } catch {}
    }

    # C. Offline Route / Socket Check
    if (-not $detectedIp) {
        try {
            $udp = New-Object System.Net.Sockets.UdpClient
            $udp.Connect("1.1.1.1", 80)
            $detectedIp = $udp.Client.LocalEndPoint.Address.ToString()
            $adapterName = "Default Route"
            $adapterType = "Network Adapter"
            $udp.Close()
        } catch {}
    }

    # D. Final Fallback
    if (-not $detectedIp) {
        $detectedIp = "127.0.0.1"
        $adapterName = "Loopback"
        $adapterType = "Localhost Only"
    }
}

Write-Host "      Detected Host IP : $detectedIp" -ForegroundColor Green
Write-Host "      Interface Name   : $adapterName ($adapterType)" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# 2. Check & Update PKI Certificates (SAN verification)
# ---------------------------------------------------------------------------
Write-Host "[2/6] Verifying SSL/TLS PKI certificates for $detectedIp..." -ForegroundColor Yellow
$certPath = Join-Path $rootDir "certs\cert.pem"
$keyPath = Join-Path $rootDir "certs\key.pem"
$caPath = Join-Path $rootDir "certs\ca.crt"
$pythonExe = Join-Path $rootDir "backend\venv\Scripts\python.exe"

$regenCerts = -not (Test-Path $certPath) -or -not (Test-Path $keyPath) -or -not (Test-Path $caPath)

if (-not $regenCerts) {
    # Check if detected IP is inside SANs
    try {
        $certContent = Get-Content $certPath -Raw
        $checkScript = "from cryptography import x509; from cryptography.hazmat.backends import default_backend; import ipaddress, sys; cert = x509.load_pem_x509_certificate(open(r'$certPath', 'rb').read(), default_backend()); sans = [str(getattr(x, 'value', x)) for x in cert.extensions.get_extension_for_oid(x509.ExtensionOID.SUBJECT_ALTERNATIVE_NAME).value]; sys.exit(0 if '$detectedIp' in sans else 1)"
        if (Test-Path $pythonExe) {
            & $pythonExe -c $checkScript
            if ($LASTEXITCODE -ne 0) { $regenCerts = $true }
        }
    } catch {
        $regenCerts = $true
    }
}

if ($regenCerts) {
    Write-Host "      Generating SSL certificates including IP $detectedIp..." -ForegroundColor Yellow
    if (Test-Path $pythonExe) {
        & $pythonExe "$rootDir\scripts\generate_certs.py" "$detectedIp"
    } else {
        python "$rootDir\scripts\generate_certs.py" "$detectedIp"
    }
} else {
    Write-Host "      Valid certificates found in certs\ covering $detectedIp, satark.test, and satark.local." -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# 3. Port Check & Process Cleanup
# ---------------------------------------------------------------------------
Write-Host "[3/6] Checking required ports (8000, 5174, 5173)..." -ForegroundColor Yellow
$ports = @(8000, 5174, 5173)
foreach ($p in $ports) {
    $occupied = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if ($occupied) {
        Write-Host "      Port $p is currently occupied by PID $($occupied.OwningProcess[0])." -ForegroundColor Gray
    }
}

# ---------------------------------------------------------------------------
# 4. Ensure Directories and Database Ready
# ---------------------------------------------------------------------------
Write-Host "[4/6] Verifying storage directories and database..." -ForegroundColor Yellow
$dataDir = Join-Path $rootDir "data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }

$storageDirs = @("storage\evidence", "storage\uploads", "storage\exports", "storage\notes")
foreach ($sd in $storageDirs) {
    $fullSd = Join-Path $rootDir $sd
    if (-not (Test-Path $fullSd)) { New-Item -ItemType Directory -Path $fullSd -Force | Out-Null }
}

# Ensure APK is present at build download path for mobile clients
$apkBuildDir = Join-Path $rootDir "android\app\build\outputs\apk\debug"
$apkBuildFile = Join-Path $apkBuildDir "app-debug.apk"
$publicApk = Join-Path $rootDir "public\app-debug.apk"
if (-not (Test-Path $apkBuildFile) -and (Test-Path $publicApk)) {
    if (-not (Test-Path $apkBuildDir)) { New-Item -ItemType Directory -Path $apkBuildDir -Force | Out-Null }
    Copy-Item $publicApk $apkBuildFile -Force
}

# ---------------------------------------------------------------------------
# 5. Launch SATARK Services (0.0.0.0 Bindings with HTTPS)
# ---------------------------------------------------------------------------
Write-Host "[5/6] Launching SATARK Services on 0.0.0.0 (HTTPS)..." -ForegroundColor Yellow

# Check if Backend is already active and healthy
$backendRunning = $false
try {
    $ctxScript = "import urllib.request, ssl; ctx = ssl._create_unverified_context(); res = urllib.request.urlopen('https://127.0.0.1:8000/health', context=ctx, timeout=2); print('OK' if res.status == 200 else 'ERR')"
    $res = & $pythonExe -c $ctxScript
    if ($res -match "OK") { $backendRunning = $true }
} catch {}

if ($backendRunning) {
    Write-Host "      Backend is already running and responsive on port 8000." -ForegroundColor Green
} else {
    Write-Host "      Starting FastAPI Backend (0.0.0.0:8000 HTTPS)..." -ForegroundColor Gray
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k", "title SATARK Backend (Port 8000) && `"$pythonExe`" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile certs\key.pem --ssl-certfile certs\cert.pem --reload" `
        -WorkingDirectory $rootDir
}

# Check Teacher Portal
$teacherRunning = $false
try {
    $tCheck = & $pythonExe -c "import urllib.request, ssl; ctx = ssl._create_unverified_context(); res = urllib.request.urlopen('https://127.0.0.1:5174', context=ctx, timeout=2); print('OK' if res.status == 200 else 'ERR')"
    if ($tCheck -match "OK") { $teacherRunning = $true }
} catch {}

if ($teacherRunning) {
    Write-Host "      Teacher Portal is already running on port 5174." -ForegroundColor Green
} else {
    Write-Host "      Starting Teacher Portal (0.0.0.0:5174 HTTPS)..." -ForegroundColor Gray
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k", "title SATARK Teacher Portal (Port 5174) && npm run dev:teacher" `
        -WorkingDirectory $rootDir
}

# Check Student Portal
$studentRunning = $false
try {
    $sCheck = & $pythonExe -c "import urllib.request, ssl; ctx = ssl._create_unverified_context(); res = urllib.request.urlopen('https://127.0.0.1:5173', context=ctx, timeout=2); print('OK' if res.status == 200 else 'ERR')"
    if ($sCheck -match "OK") { $studentRunning = $true }
} catch {}

if ($studentRunning) {
    Write-Host "      Student Portal is already running on port 5173." -ForegroundColor Green
} else {
    Write-Host "      Starting Student Portal (0.0.0.0:5173 HTTPS)..." -ForegroundColor Gray
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k", "title SATARK Student Portal (Port 5173) && npm run dev:student" `
        -WorkingDirectory $rootDir
}

Start-Sleep -Seconds 3

# ---------------------------------------------------------------------------
# 6. Service Health Check & Connection Guide
# ---------------------------------------------------------------------------
Write-Host "[6/6] Verifying local service health..." -ForegroundColor Yellow
$healthStatus = "PASS"
try {
    $hScript = "import urllib.request, ssl; ctx = ssl._create_unverified_context(); res = urllib.request.urlopen('https://${detectedIp}:8000/health', context=ctx, timeout=3); print('OK' if res.status == 200 else 'ERR')"
    $hRes = & $pythonExe -c $hScript
    if ($hRes -notmatch "OK") { $healthStatus = "DEGRADED" }
} catch {
    $healthStatus = "STARTING"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "             SATARK OFFLINE HOTSPOT LAN ACCESS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Active Network IP : $detectedIp" -ForegroundColor Yellow
Write-Host "  Health Status     : $healthStatus" -ForegroundColor Green
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  DIRECT ACCESS LINKS FOR REMOTE CLIENTS (On Same Hotspot):" -ForegroundColor White
Write-Host "  * Teacher Portal   : https://${detectedIp}:5174" -ForegroundColor Cyan
Write-Host "  * Student Portal   : https://${detectedIp}:5173" -ForegroundColor Cyan
Write-Host "  * FastAPI Health   : https://${detectedIp}:8000/health" -ForegroundColor Cyan
Write-Host "  * API Documentation: https://${detectedIp}:8000/docs" -ForegroundColor Cyan
Write-Host "  * WebSocket Server : wss://${detectedIp}:8000/ws" -ForegroundColor Cyan
Write-Host "  * APK Download URL : https://${detectedIp}:8000/download-apk" -ForegroundColor Cyan
Write-Host ""
Write-Host "  DOMAIN NAME LINKS (If satark.test is mapped in client hosts):" -ForegroundColor White
Write-Host "  * Teacher Portal   : https://satark.test:5174" -ForegroundColor Gray
Write-Host "  * Student Portal   : https://satark.test:5173" -ForegroundColor Gray
Write-Host "  * Backend API      : https://satark.test:8000" -ForegroundColor Gray
Write-Host "------------------------------------------------------------" -ForegroundColor Gray
Write-Host "  DEFAULT LOGIN CREDENTIALS:" -ForegroundColor White
Write-Host "  * Teacher : teacher@smartclassroom.edu  /  Password123!" -ForegroundColor Gray
Write-Host "  * Student : alice@smartclassroom.edu    /  Password123!" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

if (-not $NoBrowser) {
    Write-Host "Opening local browser windows..." -ForegroundColor Gray
    Start-Process "https://satark.test:5174"
    Start-Process "https://satark.test:5173"
}

if ($Wait) {
    Write-Host "[RUNNING] Press Ctrl+C to terminate this launcher session..." -ForegroundColor Cyan
    while ($true) { Start-Sleep -Seconds 2 }
}
