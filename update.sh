#!/bin/bash
set -e

echo "=================================="
echo "  n8watch — Updater"
echo "=================================="

# ── Pull latest changes ───────────────────────────────────────────────────────
echo ""
echo "Pulling latest changes from repository..."
git pull
echo "✓ Repository updated"

# ── Install / update backend dependencies ─────────────────────────────────────
echo ""
echo "Installing backend dependencies..."
npm install --omit=dev
echo "✓ Backend dependencies installed"

# ── Install / update and rebuild frontend ─────────────────────────────────────
echo ""
echo "Installing frontend dependencies..."
cd client
npm install
echo "Building frontend for production..."
npm run build
cd ..
echo "✓ Frontend built"

# ── Stamp build version ────────────────────────────────────────────────────────
echo ""
echo "Stamping build version..."
mkdir -p data
printf '{"version":"%s"}' "$(date -u +%s)" > data/version.json
echo "✓ Version stamp written"

# ── Restart PM2 if it is managing n8watch ─────────────────────────────────────
echo ""
if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q "n8watch"; then
    echo "PM2 detected — reloading n8watch..."
    pm2 reload n8watch
    echo "✓ n8watch reloaded via PM2"
else
    echo "PM2 is not managing n8watch."
    echo "  If you use PM2, run:    npm run pm2:restart"
    echo "  If you use node, run:   npm start"
fi

echo ""
echo "=================================="
echo "  Update Complete!"
echo "=================================="
echo ""
