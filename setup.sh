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

if [ ! -f config.yaml ]; then
    cp config.example.yaml config.yaml
    echo ""
    echo "✓ Created config.yaml from config.example.yaml"
    echo "  *** IMPORTANT: Edit config.yaml with your target IPs and SMTP settings ***"
else
    echo ""
    echo "✓ config.yaml already exists (not overwritten)"
fi

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Edit config.yaml with your target IP addresses and SMTP settings"
echo "  2. Start the application:  npm start"
echo "  3. Open in browser:        http://localhost:3000"
echo ""
