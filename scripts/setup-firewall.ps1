<#
.SYNOPSIS
    SATARK -- Windows Firewall Configuration Script
.DESCRIPTION
    Safely opens inbound TCP ports 8000 (Backend), 5174 (Teacher Portal),
    and 5173 (Student Portal) strictly on Private network profiles.
    Does NOT disable the firewall or expose ports to Public networks.
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
Write-Host " SATARK -- Configuring Windows Firewall (Private Network Only)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$rules = @(
    @{ Name = "SATARK-Backend-8000"; Port = 8000; Description = "FastAPI Local REST & WebSocket API" },
    @{ Name = "SATARK-Teacher-5174"; Port = 5174; Description = "Teacher & Proctor Portal" },
    @{ Name = "SATARK-Student-5173"; Port = 5173; Description = "Student & Candidate Portal" }
)

foreach ($r in $rules) {
    $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "[*] Rule '$($r.Name)' already exists. Updating..." -ForegroundColor Gray
        Set-NetFirewallRule -DisplayName $r.Name -Profile Private -Enabled True
    } else {
        Write-Host "[+] Creating inbound rule '$($r.Name)' on TCP port $($r.Port) (Private profile)..." -ForegroundColor Green
        New-NetFirewallRule -DisplayName $r.Name `
            -Direction Inbound `
            -LocalPort $r.Port `
            -Protocol TCP `
            -Action Allow `
            -Profile Private `
            -Description $r.Description | Out-Null
    }
}

Write-Host "`n[SUCCESS] Windows Firewall configured for SATARK local LAN communication." -ForegroundColor Green
Write-Host "Verify network profile is set to 'Private':" -ForegroundColor Yellow
Write-Host "  Get-NetConnectionProfile | Select-Object Name, NetworkCategory" -ForegroundColor Gray
