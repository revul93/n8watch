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

# ── PM2 startup ───────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────"
echo "  PM2 — Process Manager (recommended)"
echo "─────────────────────────────────────────────────"
echo "Would you like to start n8netwatch with PM2 and enable auto-startup on reboot?"
echo "  (PM2 keeps the app running and restarts it automatically after a system reboot)"
printf "  [Y/n]: "
# Read from /dev/tty so the prompt works even when stdin is a pipe (e.g. curl | bash).
# If no terminal is available (fully non-interactive), default to "n".
if [ -e /dev/tty ]; then
  read -r DO_PM2 < /dev/tty
else
  DO_PM2="n"
  echo ""
  echo "  (Non-interactive mode detected — skipping PM2 auto-start)"
fi

if [[ ! "$DO_PM2" =~ ^[Nn]$ ]]; then

  # Install PM2 if not present
  if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "PM2 not found. Installing PM2 globally..."
    npm install -g pm2
    echo "✓ PM2 installed"
  else
    echo "✓ PM2 already installed ($(pm2 --version))"
  fi

  # Start / restart the app with PM2
  echo ""
  echo "Starting n8netwatch with PM2..."
  if pm2 start ecosystem.config.js; then
    echo "✓ n8netwatch started"
  else
    echo "  WARNING: pm2 start failed. Check ecosystem.config.js and try again with: npm run pm2:start"
  fi

  # Persist the process list so PM2 restores it after a reboot
  echo ""
  echo "Saving PM2 process list..."
  if pm2 save; then
    echo "✓ Process list saved"
  else
    echo "  WARNING: pm2 save failed. Run 'npm run pm2:save' manually to persist the process list."
  fi

  # Configure the system init script for auto-startup.
  # pm2 startup prints the exact privileged command to run, e.g.:
  #   sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u user --hp /home/user
  # We strip ANSI codes and extract that line, then validate and execute it.
  echo ""
  echo "Configuring PM2 to auto-start on system reboot..."
  STARTUP_CMD=$(pm2 startup 2>&1 | sed 's/\x1B\[[0-9;]*[mK]//g' | grep -E "^\s*sudo\s+(env|pm2)\s+" | head -1 | xargs)
  if [[ "$STARTUP_CMD" =~ ^sudo\ (env|pm2)\  ]]; then
    echo "Running: $STARTUP_CMD"
    eval "$STARTUP_CMD" && echo "✓ Auto-startup configured"
  else
    echo ""
    echo "  Could not extract the startup command automatically."
    echo "  Run the following manually to enable auto-startup:"
    pm2 startup
  fi

  PM2_WAS_STARTED=true
else
  PM2_WAS_STARTED=false
fi

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Edit config.yaml with your target IP addresses and SMTP settings"
echo ""

if [ "$PM2_WAS_STARTED" = true ]; then
  echo "  n8netwatch is running via PM2 — open http://localhost:3000"
  echo ""
  echo "  Useful PM2 commands:"
  echo "    Logs:     npm run pm2:logs"
  echo "    Status:   npm run pm2:status"
  echo "    Stop:     npm run pm2:stop"
  echo "    Restart:  npm run pm2:restart"
else
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
fi
echo ""
