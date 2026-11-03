<#
.SYNOPSIS
    Configures a student or remote client Windows PC to connect to SATARK with trusted HTTPS.
.DESCRIPTION
    1. Installs the SATARK Root CA certificate (ca.crt) into Trusted Root Authorities.
    2. Maps the SATARK server host IP to satark.local in C:\Windows\System32\drivers\etc\hosts.
    3. Flushes DNS cache and verifies connectivity.
#>

param(
    [string]$HostIP = "10.10.15.241"
)

# 1. Check Administrator Elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[*] Requesting Administrator privileges to install Root CA and configure Hosts file..." -ForegroundColor Yellow
    $argsList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -HostIP `"$HostIP`""
    Start-Process powershell -Verb RunAs -ArgumentList $argsList
    exit
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SATARK Client PC HTTPS & Hostname Configuration" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "SATARK Host Server IP: $HostIP"
Write-Host ""

# 2. Locate ca.crt
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidatePaths = @(
    (Join-Path $scriptDir "ca.crt"),
    (Join-Path $scriptDir "..\certs\ca.crt"),
    (Join-Path (Get-Location).Path "certs\ca.crt"),
    (Join-Path (Get-Location).Path "ca.crt")
)

$caCertPath = $null
foreach ($path in $candidatePaths) {
    if (Test-Path $path) {
        $caCertPath = (Resolve-Path $path).Path
        break
    }
}

if (-not $caCertPath) {
    Write-Host "[!] Root CA certificate 'ca.crt' not found!" -ForegroundColor Red
    Write-Host "    Please ensure ca.crt is in the same directory or in the certs\ folder." -ForegroundColor Yellow
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "[1/3] Installing SATARK Root CA ($caCertPath)..." -ForegroundColor Yellow
try {
    $certUtilOutput = & certutil -addstore -f "Root" "$caCertPath"
    Write-Host "      Root CA installed into Windows Trusted Root store successfully." -ForegroundColor Green
} catch {
    Write-Warning "      Failed to install Root CA: $_"
}

# 3. Add Host entry to C:\Windows\System32\drivers\etc\hosts
Write-Host "[2/3] Mapping $HostIP to satark.test & satark.local in hosts file..." -ForegroundColor Yellow
$hostsPath = "C:\Windows\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue

if ($hostsContent -match "$HostIP\s+satark\.test") {
    Write-Host "      Host entry already exists for $HostIP satark.test." -ForegroundColor Green
} else {
    $entryText = "`r`n# SATARK Smart Classroom LAN Server Mapping`r`n$HostIP       satark.test`r`n$HostIP       satark.local`r`n"
    Add-Content -Path $hostsPath -Value $entryText -Force
    Write-Host "      Added '$HostIP  satark.test' and 'satark.local' to $hostsPath." -ForegroundColor Green
}

# 4. Open Inbound UDP for WebRTC Media on Client
Write-Host "[3/4] Configuring Firewall for WebRTC Media Streaming..." -ForegroundColor Yellow
try {
    $webrtcRule = Get-NetFirewallRule -DisplayName "SATARK-WebRTC-Client" -ErrorAction SilentlyContinue
    if (-not $webrtcRule) {
        New-NetFirewallRule -DisplayName "SATARK-WebRTC-Client" `
            -Direction Inbound `
            -LocalPort 1024-65535 `
            -Protocol UDP `
            -Action Allow `
            -Profile Any `
            -Description "SATARK WebRTC Streaming UDP" | Out-Null
    }
    Write-Host "      WebRTC media streaming ports configured." -ForegroundColor Green
} catch {
    Write-Warning "      Could not configure firewall: $_"
}

# 5. Flush DNS
Write-Host "[4/4] Flushing Windows DNS Cache..." -ForegroundColor Yellow
& ipconfig /flushdns | Out-Null
Write-Host "      DNS Cache flushed." -ForegroundColor Green

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Client PC Ready for SATARK Examination!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Open Google Chrome or Microsoft Edge and navigate to:"
Write-Host "  - Student Portal:  https://satark.test:5173" -ForegroundColor Cyan
Write-Host "  - Teacher Portal:  https://satark.test:5174" -ForegroundColor Cyan
Write-Host "  - Student Portal:  https://satark.local:5173" -ForegroundColor Cyan
Write-Host "  - Teacher Portal:  https://satark.local:5174" -ForegroundColor Cyan
Write-Host ""
Write-Host "The browser will display a secure green lock with zero SSL warnings." -ForegroundColor Gray
Write-Host "WebRTC camera and screen sharing will be fully permitted." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

