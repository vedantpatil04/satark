<#
.SYNOPSIS
    Configures SATARK host PC for trusted local HTTPS, WSS, and satark.local resolution.
.DESCRIPTION
    1. Ensures Local Root CA and server certificates exist.
    2. Imports the Root CA into the Windows Trusted Root Certification Authorities store.
    3. Adds satark.local to C:\Windows\System32\drivers\etc\hosts.
    4. Flushes Windows DNS cache.
#>

param(
    [string]$LanIp = ""
)

if (-not $LanIp) {
    # 1. Check for active Windows Mobile Hotspot adapter (Wi-Fi Direct)
    try {
        $hotspotAdapter = Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and $_.InterfaceDescription -match 'Wi-Fi Direct'
        }
        if ($hotspotAdapter) {
            $hsIp = (Get-NetIPAddress -InterfaceIndex $hotspotAdapter[0].InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                     Where-Object { $_.IPAddress -notmatch '^169\.254\.' -and $_.IPAddress -notmatch '^127\.' }).IPAddress
            if ($hsIp) { $LanIp = $hsIp }
        }
    } catch {}

    # 2. Check for active Up Wi-Fi or Ethernet adapter with Preferred IPv4
    if (-not $LanIp) {
        try {
            $upAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
            foreach ($adapter in $upAdapters) {
                $ipObj = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                         Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notmatch '^169\.254\.' -and $_.IPAddress -notmatch '^127\.' }
                if ($ipObj) {
                    $LanIp = $ipObj[0].IPAddress
                    break
                }
            }
        } catch {}
    }

    # 3. Try socket route lookup as supplementary check
    if (-not $LanIp) {
        try {
            $udp = New-Object System.Net.Sockets.UdpClient
            $udp.Connect("1.1.1.1", 80)
            $LanIp = $udp.Client.LocalEndPoint.Address.ToString()
            $udp.Close()
        } catch {}
    }

    # 4. Final fallback
    if (-not $LanIp) {
        $LanIp = "127.0.0.1"
    }
}

# 1. Require Administrator Elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[*] Requesting Administrator privileges to configure Hosts file and Root CA store..." -ForegroundColor Yellow
    $argsList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -LanIp `"$LanIp`""
    Start-Process powershell -Verb RunAs -ArgumentList $argsList
    exit
}

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SATARK Host HTTPS & Hostname Configuration" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Repository Root: $repoRoot"
Write-Host "Target Host IP:  $LanIp"
Write-Host ""

# 2. Ensure PKI Certificates Exist
$caCertPath = Join-Path $repoRoot "certs\ca.crt"
$serverCertPath = Join-Path $repoRoot "certs\cert.pem"
$serverKeyPath = Join-Path $repoRoot "certs\key.pem"

$pythonExe = Join-Path $repoRoot "backend\venv\Scripts\python.exe"
$needCerts = -not (Test-Path $caCertPath) -or -not (Test-Path $serverCertPath) -or -not (Test-Path $serverKeyPath)

if ($needCerts) {
    Write-Host "[1/4] Generating Local Root CA and SSL Certificates..." -ForegroundColor Yellow
    if (Test-Path $pythonExe) {
        & $pythonExe "$repoRoot\scripts\generate_certs.py" "$LanIp"
    } else {
        python "$repoRoot\scripts\generate_certs.py" "$LanIp"
    }
} else {
    Write-Host "[1/4] Local PKI Certificates found in certs\" -ForegroundColor Green
}

# 3. Install Root CA into Windows Trusted Root Store
Write-Host "[2/4] Installing Root CA into Windows Trusted Root Store (Cert:\LocalMachine\Root)..." -ForegroundColor Yellow
try {
    $certUtilOutput = & certutil -addstore -f "Root" "$caCertPath"
    Write-Host "      Root CA installed successfully." -ForegroundColor Green
} catch {
    Write-Warning "      Failed to install via certutil: $_"
}

# 4. Update C:\Windows\System32\drivers\etc\hosts
Write-Host "[3/4] Configuring C:\Windows\System32\drivers\etc\hosts for satark.local..." -ForegroundColor Yellow
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue

$entriesToAdd = @(
    "127.0.0.1       satark.test",
    "$LanIp       satark.test",
    "127.0.0.1       satark.local",
    "$LanIp       satark.local"
)

$needsUpdate = $false
foreach ($entry in $entriesToAdd) {
    $cleanEntry = $entry.Trim()
    if ($hostsContent -notmatch [regex]::Escape($cleanEntry)) {
        $needsUpdate = $true
    }
}

# Clean existing satark entries and replace with fresh current IP mapping
$lines = (Get-Content $hostsPath -ErrorAction SilentlyContinue) | Where-Object {
    $_ -notmatch "satark\.test" -and $_ -notmatch "satark\.local" -and $_ -notmatch "SATARK Smart Classroom"
}
$satarkSection = @(
    "# SATARK Smart Classroom Integrity Platform LAN Mapping",
    "127.0.0.1       satark.test",
    "$LanIp       satark.test",
    "127.0.0.1       satark.local",
    "$LanIp       satark.local"
)
$newHostsContent = ($lines + $satarkSection) -join "`r`n"
Set-Content -Path $hostsPath -Value $newHostsContent -Force
Write-Host "      Configured satark.test & satark.local pointing to $LanIp in hosts file." -ForegroundColor Green

# 5. Configure Windows Firewall
Write-Host "[4/5] Opening Windows Firewall for LAN TCP & WebRTC UDP..." -ForegroundColor Yellow
$firewallScript = Join-Path $repoRoot "scripts\setup-firewall.ps1"
if (Test-Path $firewallScript) {
    & $firewallScript
}

# 6. Flush DNS
Write-Host "[5/5] Flushing DNS Cache..." -ForegroundColor Yellow
& ipconfig /flushdns | Out-Null
Write-Host "      DNS Cache flushed." -ForegroundColor Green

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SATARK Host Setup Complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "You can now access all SATARK services via trusted HTTPS:"
Write-Host "  - Teacher Portal:  https://satark.test:5174" -ForegroundColor Cyan
Write-Host "  - Student Portal:  https://satark.test:5173" -ForegroundColor Cyan
Write-Host "  - Backend API:     https://satark.test:8000" -ForegroundColor Cyan
Write-Host "  - Interactive API: https://satark.test:8000/docs" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

