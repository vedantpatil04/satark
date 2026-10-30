<#
.SYNOPSIS
    SATARK -- Safe Service Stop Script
.DESCRIPTION
    Stops only SATARK-owned backend and frontend processes recorded in data/pids.json.
    Does NOT terminate unrelated processes.
#>

[CmdletBinding()]
param()

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$pidFile = Join-Path $rootDir "data\pids.json"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SATARK -- Stopping Local Services" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Test-Path $pidFile)) {
    Write-Host "[*] No active SATARK instance recorded in data/pids.json" -ForegroundColor Yellow
    exit 0
}

try {
    $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
} catch {
    Write-Warning "Could not parse data/pids.json"
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

function Stop-SpecificProcess([int]$id, [string]$label) {
    if ($id -gt 0) {
        $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "[+] Stopping $label (PID: $id)..." -ForegroundColor Yellow
            try {
                & taskkill /PID $id /T /F 2>$null | Out-Null
                Write-Host "    $label stopped successfully." -ForegroundColor Green
            } catch {
                Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
            }
        } else {
            Write-Host "[*] $label (PID: $id) was already stopped." -ForegroundColor Gray
        }
    }
}

if ($pids.backend_pid) {
    Stop-SpecificProcess -id $pids.backend_pid -label "FastAPI Backend"
}

if ($pids.teacher_pid) {
    Stop-SpecificProcess -id $pids.teacher_pid -label "Teacher Portal"
}

if ($pids.student_pid) {
    Stop-SpecificProcess -id $pids.student_pid -label "Student Portal"
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "`n[SUCCESS] SATARK local services stopped cleanly." -ForegroundColor Green
