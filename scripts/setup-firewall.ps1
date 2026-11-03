<#
.SYNOPSIS
    SATARK -- Windows Firewall Configuration Script
.DESCRIPTION
    Safely opens inbound TCP ports 8000 (Backend), 5174 (Teacher Portal),
    and 5173 (Student Portal), as well as WebRTC UDP dynamic ports (1024-65535)
    across all profiles (Private, Public, Domain) to support Wi-Fi hotspots and LANs.
#>

[CmdletBinding()]
param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Warning "Administrator rights required to modify Windows Firewall rules."
    Write-Host "Please re-run this script in an elevated PowerShell terminal (Run as Administrator)." -ForegroundColor Yellow
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK -- Configuring Windows Firewall (TCP & WebRTC UDP)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$tcpRules = @(
    @{ Name = "SATARK-Backend-8000"; Port = 8000; Description = "FastAPI Local REST & WebSocket API" },
    @{ Name = "SATARK-Teacher-5174"; Port = 5174; Description = "Teacher & Proctor Portal" },
    @{ Name = "SATARK-Student-5173"; Port = 5173; Description = "Student & Candidate Portal" }
)

foreach ($r in $tcpRules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "[*] Rule '$($r.Name)' already exists. Updating..." -ForegroundColor Gray
        Set-NetFirewallRule -DisplayName $r.Name -Profile Any -Enabled True
    } else {
        Write-Host "[+] Creating inbound rule '$($r.Name)' on TCP port $($r.Port)..." -ForegroundColor Green
        New-NetFirewallRule -DisplayName $r.Name `
            -Direction Inbound `
            -LocalPort $r.Port `
            -Protocol TCP `
            -Action Allow `
            -Profile Any `
            -Description $r.Description | Out-Null
    }
}

# WebRTC Media Transport (UDP)
$webrtcRule = Get-NetFirewallRule -DisplayName "SATARK-WebRTC-UDP" -ErrorAction SilentlyContinue
if ($webrtcRule) {
    Write-Host "[*] Rule 'SATARK-WebRTC-UDP' already exists. Updating..." -ForegroundColor Gray
    Set-NetFirewallRule -DisplayName "SATARK-WebRTC-UDP" -Profile Any -Enabled True
} else {
    Write-Host "[+] Creating inbound rule 'SATARK-WebRTC-UDP' on UDP ports 1024-65535..." -ForegroundColor Green
    New-NetFirewallRule -DisplayName "SATARK-WebRTC-UDP" `
        -Direction Inbound `
        -LocalPort 1024-65535 `
        -Protocol UDP `
        -Action Allow `
        -Profile Any `
        -Description "SATARK P2P WebRTC Camera & Screen Streaming UDP" | Out-Null
}

Write-Host "`n[SUCCESS] Windows Firewall configured for SATARK local LAN communication (TCP & UDP)." -ForegroundColor Green
Write-Host "Current Network Connection Profile:" -ForegroundColor Yellow
Get-NetConnectionProfile | Select-Object Name, NetworkCategory
