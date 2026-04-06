# n8watch — Windows Setup Script
# Run with: powershell -ExecutionPolicy Bypass -File setup.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  n8watch — Setup (Windows)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "       Download it from https://nodejs.org (v18 or later)" -ForegroundColor Red
    exit 1
}

$nodeVersion = (node -e "process.stdout.write(process.versions.node.split('.')[0])")
if ([int]$nodeVersion -lt 18) {
    Write-Host "ERROR: Node.js 18+ is required. Current version: $(node -v)" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Node.js $(node -v) detected" -ForegroundColor Green

# ── Install backend dependencies ───────────────────────────────────────────────

Write-Host ""
Write-Host "Installing backend dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install failed." -ForegroundColor Red
    exit 1
}

# ── Install and build frontend ─────────────────────────────────────────────────

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

# ── Create data / logs directories ────────────────────────────────────────────

New-Item -ItemType Directory -Force -Path "data"  | Out-Null
New-Item -ItemType Directory -Force -Path "logs"  | Out-Null

# ── Network interface detection ───────────────────────────────────────────────
# Returns an array of objects with Name and IPAddress, excluding loopback.
function Get-NonLoopbackInterfaces {
    $result = @()
    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -ne '0.0.0.0' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } | Sort-Object InterfaceIndex
        foreach ($addr in $addresses) {
            $adapter = Get-NetAdapter -InterfaceIndex $addr.InterfaceIndex -ErrorAction SilentlyContinue
            if ($adapter -and $adapter.Status -eq 'Up') {
                $result += [PSCustomObject]@{
                    Name      = $adapter.Name
                    IPAddress = $addr.IPAddress
                }
            }
        }
    } catch {
        # Return empty on any error; caller will fall back to example config
    }
    return $result
}

# Replaces the interfaces: section in $sourcePath with $interfaceYaml lines.
function Set-InterfacesSection {
    param (
        [string]   $sourcePath,
        [string[]] $interfaceYaml
    )
    $lines    = Get-Content $sourcePath
    $result   = [System.Collections.Generic.List[string]]::new()
    $inIfaces = $false
    foreach ($line in $lines) {
        if ($line -match '^interfaces:') {
            $inIfaces = $true
            foreach ($ifLine in $interfaceYaml) { $result.Add($ifLine) }
            $result.Add('')
        } elseif ($inIfaces -and $line -match '^[a-zA-Z]') {
            $inIfaces = $false
            $result.Add($line)
        } elseif (-not $inIfaces) {
            $result.Add($line)
        }
        # Lines inside the example interfaces block are intentionally skipped
    }
    return $result
}

# ── Create config.yaml ────────────────────────────────────────────────────────

if (-not (Test-Path "config.yaml")) {
    $ifaces = Get-NonLoopbackInterfaces
    if ($ifaces.Count -gt 0) {
        $yamlLines = @('interfaces:')
        $index = 0
        foreach ($iface in $ifaces) {
            $alias = switch ($index) {
                0       { 'Primary LAN' }
                1       { 'Secondary LAN' }
                default { "Interface $($index + 1)" }
            }
            $yamlLines += "  - name: `"$($iface.Name)`""
            $yamlLines += "    alias: `"$alias`""
            $yamlLines += "    ipv4: `"$($iface.IPAddress)`""
            $index++
        }
        $configLines = Set-InterfacesSection -sourcePath "config.example.yaml" -interfaceYaml $yamlLines
        $configLines | Set-Content "config.yaml"
        Write-Host ""
        Write-Host "[OK] Created config.yaml with detected network interfaces" -ForegroundColor Green
    } else {
        Copy-Item "config.example.yaml" "config.yaml"
        Write-Host ""
        Write-Host "[OK] Created config.yaml from config.example.yaml (no interfaces detected)" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "[OK] config.yaml already exists (not overwritten)" -ForegroundColor Green
}

Write-Host ""
Write-Host "  *** IMPORTANT: Edit config.yaml with your target IPs and SMTP settings ***" -ForegroundColor Yellow

# ── PM2 startup (optional) ────────────────────────────────────────────────────

Write-Host ""
Write-Host "-------------------------------------------------" -ForegroundColor Cyan
Write-Host "  PM2 — Process Manager (recommended)" -ForegroundColor Cyan
Write-Host "-------------------------------------------------" -ForegroundColor Cyan
Write-Host "Would you like to start n8watch with PM2 and enable auto-startup on reboot?"
Write-Host "  (PM2 keeps the app running and restarts it automatically)"
$dopm2 = Read-Host "  [Y/n]"

$pm2WasStarted = $false

if ($dopm2 -notmatch "^[Nn]$") {

    if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "PM2 not found. Installing PM2 globally..."
        npm install -g pm2
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: pm2 install failed. You can install it later with: npm install -g pm2" -ForegroundColor Yellow
        } else {
            Write-Host "[OK] PM2 installed" -ForegroundColor Green
        }
    } else {
        Write-Host "[OK] PM2 already installed ($(pm2 --version))" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Starting n8watch with PM2..."
    pm2 start ecosystem.config.js
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] n8watch started" -ForegroundColor Green
        pm2 save
        $pm2WasStarted = $true
    } else {
        Write-Host "WARNING: pm2 start failed. Try manually: npm run pm2:start" -ForegroundColor Yellow
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Edit config.yaml with your target IP addresses and SMTP settings"
Write-Host ""

if ($pm2WasStarted) {
    Write-Host "  n8watch is running via PM2 — open http://localhost:3000"
    Write-Host ""
    Write-Host "  Useful PM2 commands:"
    Write-Host "    Logs:     npm run pm2:logs"
    Write-Host "    Status:   npm run pm2:status"
    Write-Host "    Stop:     npm run pm2:stop"
    Write-Host "    Restart:  npm run pm2:restart"
} else {
    Write-Host "  -- Running with Node.js directly --"
    Write-Host "  2a. Start:  node server\index.js"
    Write-Host "      Open:   http://localhost:3000"
    Write-Host "      Stop:   Ctrl+C"
    Write-Host ""
    Write-Host "  -- Running with PM2 (recommended for production) --"
    Write-Host "  Install PM2 globally (one-time):  npm install -g pm2"
    Write-Host "  2b. Start:    npm run pm2:start"
    Write-Host "      Logs:     npm run pm2:logs"
    Write-Host "      Status:   npm run pm2:status"
    Write-Host "      Stop:     npm run pm2:stop"
}
Write-Host ""
