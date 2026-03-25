#!/bin/bash
set -e

echo "=================================="
echo "  n8netwatch — Setup"
echo "=================================="

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

if ! command -v ping &> /dev/null; then
    echo "ERROR: ping command not found."
    exit 1
fi

echo "✓ Node.js $(node -v) detected"
echo "✓ ping binary found at $(which ping)"

echo ""
echo "Installing backend dependencies..."
npm install

echo ""
echo "Installing frontend dependencies..."
cd client
npm install
echo "Building frontend for production..."
npm run build
cd ..

mkdir -p data
mkdir -p logs

# ── Create config.yaml ────────────────────────────────────────────────────────
if [ ! -f config.yaml ]; then
    cp config.example.yaml config.yaml
    echo ""
    echo "✓ Created config.yaml from config.example.yaml"
else
    echo ""
    echo "✓ config.yaml already exists (not overwritten)"
fi

echo ""
echo "  *** IMPORTANT: Edit config.yaml with your target IPs and SMTP settings ***"

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Edit config.yaml with your target IP addresses and SMTP settings"
echo ""
echo "  ── Running with Node.js directly ──────────────────────────────────"
echo "  2a. Start:  npm start"
echo "      Open:   http://localhost:3000"
echo "      Stop:   Ctrl+C"
echo ""
echo "  ── Running with PM2 (recommended for production) ───────────────────"
echo "  Install PM2 globally (one-time):  npm install -g pm2"
echo "  2b. Start:    npm run pm2:start"
echo "      Logs:     npm run pm2:logs"
echo "      Status:   npm run pm2:status"
echo "      Stop:     npm run pm2:stop"
echo "      Restart:  npm run pm2:restart"
echo "      Auto-start on boot:  npm run pm2:save && npm run pm2:startup"
echo ""
