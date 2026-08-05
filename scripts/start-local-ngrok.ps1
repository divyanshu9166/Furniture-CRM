# ──────────────────────────────────────────────────────────
#  Furniture CRM — Local Dev + ngrok Demo Tunnel (Windows)
#  Usage: powershell -ExecutionPolicy Bypass -File scripts\start-local-ngrok.ps1
# ──────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $projectRoot ".local-dev"
$devPidFile = Join-Path $stateDir "next-dev.pid"
$ngrokPidFile = Join-Path $stateDir "ngrok.pid"
$logDir = Join-Path $stateDir "logs"

New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Keep the same local toolchain path assumptions as the existing startup script.
$env:Path = "C:\pgsql-local\pgsql\bin;C:\nodejs-new\node-v22.15.0-win-x64;" + $env:Path

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Furniture CRM — ngrok Demo Mode"      -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$nodeVersion = node --version
Write-Host "[1/6] Node.js $nodeVersion" -ForegroundColor Green

$pgCtlPath = "C:\pgsql-local\pgsql\bin\pg_ctl.exe"
$pgReadyPath = "C:\pgsql-local\pgsql\bin\pg_isready.exe"
$pgRunning = $false
if (Test-Path $pgReadyPath) {
    try {
        & $pgReadyPath -h localhost -p 5432 *> $null
        if ($LASTEXITCODE -eq 0) { $pgRunning = $true }
    } catch {}
}

if (-not $pgRunning -and (Test-Path $pgCtlPath)) {
    Write-Host "[2/6] Starting PostgreSQL..." -ForegroundColor Yellow
    & $pgCtlPath -D "C:\pgsql-local\data" -l "C:\pgsql-local\pg.log" start
} elseif ($pgRunning) {
    Write-Host "[2/6] PostgreSQL already running" -ForegroundColor Green
} else {
    Write-Host "[2/6] PostgreSQL tools not found; continuing with the app's configured DATABASE_URL" -ForegroundColor Yellow
}

Write-Host "[3/6] Using project environment" -ForegroundColor Green

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "[4/6] Installing dependencies..." -ForegroundColor Yellow
    Push-Location $projectRoot
    npm install
    Pop-Location
} else {
    Write-Host "[4/6] Dependencies already installed" -ForegroundColor Green
}

$existingDevPid = if (Test-Path $devPidFile) { Get-Content $devPidFile -ErrorAction SilentlyContinue } else { $null }
if ($existingDevPid) {
    try {
        Get-Process -Id ([int]$existingDevPid) -ErrorAction Stop | Out-Null
        Write-Host "[5/6] Next.js already running (PID $existingDevPid)" -ForegroundColor Green
    } catch {
        Remove-Item $devPidFile -ErrorAction SilentlyContinue
        $existingDevPid = $null
    }
}

if (-not $existingDevPid) {
    Write-Host "[5/6] Starting Next.js dev server..." -ForegroundColor Green
    $devProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList '/c', 'npm run dev' `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput (Join-Path $logDir "next-dev.out.log") `
        -RedirectStandardError (Join-Path $logDir "next-dev.err.log") `
        -PassThru
    Set-Content -Path $devPidFile -Value $devProcess.Id
}

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    throw 'ngrok is not installed or not on PATH. Install ngrok, then run: ngrok config add-authtoken your-token'
}

function Get-NgrokPublicUrl {
    param(
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
            $publicUrl = @($tunnels.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1).public_url
            if ($publicUrl) {
                return $publicUrl
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    throw "Timed out waiting for ngrok to expose a public URL. Check the ngrok window or logs under $logDir."
}

Write-Host "[6/6] Opening ngrok tunnel on http://localhost:3000..." -ForegroundColor Green
Write-Host ""
Write-Host "  Admin Login:  admin@furniturecrm.com / admin123" -ForegroundColor Magenta
Write-Host "  Staff Login:  [staff email] / staff123" -ForegroundColor Magenta
Write-Host "  Local URL:    http://localhost:3000" -ForegroundColor Magenta
Write-Host ""
Write-Host "Keep this window open. Use scripts\\stop-local-ngrok.ps1 to stop both processes." -ForegroundColor Yellow
Write-Host ""

$ngrokProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c', 'ngrok http 3000' `
    -WorkingDirectory $projectRoot `
    -PassThru
Set-Content -Path $ngrokPidFile -Value $ngrokProcess.Id

$publicUrl = Get-NgrokPublicUrl

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Public client URL"                  -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  " + $publicUrl) -ForegroundColor Green
Write-Host ""
Write-Host "Copy this link and send it to your client." -ForegroundColor Yellow
Write-Host ""

try {
    Wait-Process -Id $ngrokProcess.Id
} finally {
    if ($ngrokProcess -and -not $ngrokProcess.HasExited) {
        Stop-Process -Id $ngrokProcess.Id -Force -ErrorAction SilentlyContinue
    }
}