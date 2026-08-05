# ──────────────────────────────────────────────────────────
#  Furniture CRM — Stop Local Dev + ngrok Demo (Windows)
#  Usage: powershell -ExecutionPolicy Bypass -File scripts\stop-local-ngrok.ps1
# ──────────────────────────────────────────────────────────

$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $projectRoot ".local-dev"
$devPidFile = Join-Path $stateDir "next-dev.pid"
$ngrokPidFile = Join-Path $stateDir "ngrok.pid"

function Stop-PidFileProcess {
    param(
        [string]$PidFile,
        [string]$Label
    )

    if (-not (Test-Path $PidFile)) {
        Write-Host "$Label not running" -ForegroundColor DarkYellow
        return
    }

    $pidText = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $pidText) {
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        return
    }

    try {
        Stop-Process -Id ([int]$pidText) -Force -ErrorAction Stop
        Write-Host "Stopped $Label (PID $pidText)" -ForegroundColor Green
    } catch {
        Write-Host "$Label PID $pidText was already stopped" -ForegroundColor DarkYellow
    } finally {
        Remove-Item $PidFile -ErrorAction SilentlyContinue
    }
}

Write-Host "Stopping ngrok demo processes..." -ForegroundColor Yellow
Stop-PidFileProcess -PidFile $ngrokPidFile -Label "ngrok"
Stop-PidFileProcess -PidFile $devPidFile -Label "Next.js dev server"

Write-Host "Done." -ForegroundColor Green