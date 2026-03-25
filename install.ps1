# n8netwatch — Windows One-Line Installer
# Run with:
#   Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/revul93/n8netwatch/main/install.ps1" -UseBasicParsing).Content
# Or download and run locally:
#   powershell -ExecutionPolicy Bypass -File install.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/revul93/n8netwatch.git"
$RepoDir = "n8netwatch"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  n8netwatch — Installer (Windows)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# ── Check for git ─────────────────────────────────────────────────────────────

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: git is not installed." -ForegroundColor Red
    Write-Host "       Download it from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# ── Clone or update repository ────────────────────────────────────────────────

if (Test-Path $RepoDir) {
    Write-Host "Directory '$RepoDir' already exists. Pulling latest changes..."
    Set-Location $RepoDir
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git pull failed." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Cloning repository..."
    git clone $RepoUrl $RepoDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git clone failed." -ForegroundColor Red
        exit 1
    }
    Set-Location $RepoDir
}

# ── Run setup ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Running setup.ps1..."
Write-Host ""
& powershell -ExecutionPolicy Bypass -File setup.ps1
