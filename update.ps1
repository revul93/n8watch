# n8watch — Windows Update Script
# Run with: powershell -ExecutionPolicy Bypass -File update.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  n8watch — Updater (Windows)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# ── Pull latest changes ───────────────────────────────────────────────────────

Write-Host "Pulling latest changes from repository..."
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git pull failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Repository updated" -ForegroundColor Green

# ── Install / update backend dependencies ─────────────────────────────────────

Write-Host ""
Write-Host "Installing backend dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Backend dependencies installed" -ForegroundColor Green

# ── Install / update and rebuild frontend ─────────────────────────────────────

Write-Host ""
Write-Host "Installing frontend dependencies..."
Set-Location client
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend npm install failed." -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "Building frontend for production..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Frontend build failed." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..
Write-Host "[OK] Frontend built" -ForegroundColor Green

# ── Stamp build version ────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Stamping build version..."
if (-not (Test-Path "data")) { New-Item -ItemType Directory -Path "data" | Out-Null }
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Set-Content -Path "data\version.json" -Value "{`"version`":`"$timestamp`"}" -Encoding UTF8
Write-Host "[OK] Version stamp written" -ForegroundColor Green

# ── Restart PM2 if it is managing n8watch ─────────────────────────────────────

Write-Host ""
$pm2Available = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Available) {
    $pm2List = pm2 list 2>&1
    if ($pm2List -match "n8watch") {
        Write-Host "PM2 detected — reloading n8watch..."
        pm2 reload n8watch
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] n8watch reloaded via PM2" -ForegroundColor Green
        } else {
            Write-Host "WARNING: pm2 reload failed. Try: npm run pm2:restart" -ForegroundColor Yellow
        }
    } else {
        Write-Host "PM2 is not managing n8watch."
        Write-Host "  If you use PM2, run:  npm run pm2:restart"
        Write-Host "  If you use node, run: npm start"
    }
} else {
    Write-Host "PM2 is not installed."
    Write-Host "  To start the app, run: npm start"
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Update Complete!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
