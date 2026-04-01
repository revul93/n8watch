#!/bin/bash
set -e

echo "=================================="
echo "  n8netwatch — Setup"
echo "=================================="

# ── Node.js + npm installation helper ────────────────────────────────────────
# Tries to install Node.js v24 LTS using nvm (cross-platform) with a fallback
# to native package managers (apt/dnf/yum) on Linux.
install_nodejs_and_npm() {
  echo ""
  echo "Node.js (v18+ required, v24 LTS recommended) and npm are needed to run n8netwatch."
  echo "Would you like to install Node.js v24 LTS and npm automatically?"
  printf "  [Y/n]: "
  if [ -e /dev/tty ]; then
    read -r INSTALL_NODE < /dev/tty
  else
    INSTALL_NODE="y"
    echo ""
    echo "  (Non-interactive mode — proceeding with Node.js v24 installation)"
  fi

  if [[ "$INSTALL_NODE" =~ ^[Nn]$ ]]; then
    echo ""
    echo "ERROR: Node.js is required. Install it from https://nodejs.org/ and re-run setup.sh"
    exit 1
  fi

  # ── Try nvm first (works on Linux and macOS) ────────────────────────────────
  if command -v curl &> /dev/null; then
    echo ""
    echo "Installing nvm (Node Version Manager)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    echo "Installing Node.js v24 LTS via nvm..."
    nvm install 24 && nvm use 24 && nvm alias default 24
  # ── Debian / Ubuntu fallback ────────────────────────────────────────────────
  elif command -v apt-get &> /dev/null && command -v sudo &> /dev/null; then
    echo ""
    echo "Installing Node.js v24 via NodeSource (Debian/Ubuntu)..."
    sudo apt-get update -qq
    sudo apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs
  # ── Fedora / RHEL (dnf) fallback ────────────────────────────────────────────
  elif command -v dnf &> /dev/null && command -v sudo &> /dev/null; then
    echo ""
    echo "Installing Node.js v24 via NodeSource (Fedora/RHEL)..."
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
    sudo dnf install -y nodejs
  # ── CentOS / older RHEL (yum) fallback ─────────────────────────────────────
  elif command -v yum &> /dev/null && command -v sudo &> /dev/null; then
    echo ""
    echo "Installing Node.js v24 via NodeSource (CentOS)..."
    curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
    sudo yum install -y nodejs
  else
    echo ""
    echo "ERROR: Cannot auto-install Node.js. Please install it manually from https://nodejs.org/"
    exit 1
  fi

  if ! command -v node &> /dev/null; then
    echo ""
    echo "ERROR: Node.js installation failed. Please install it manually from https://nodejs.org/"
    exit 1
  fi
  echo "✓ Node.js $(node -v) installed"
}

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  install_nodejs_and_npm
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ is required. Current version: $(node -v)"
    echo "Please update Node.js and re-run setup.sh"
    exit 1
fi

# ── Check npm ─────────────────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
  echo ""
  echo "ERROR: npm is not found. It is normally bundled with Node.js."
  echo "Try reinstalling Node.js from https://nodejs.org/ and re-run setup.sh"
  exit 1
fi

if ! command -v ping &> /dev/null; then
    echo "ERROR: ping command not found."
    exit 1
fi

echo "✓ Node.js $(node -v) detected"
echo "✓ npm $(npm --version) detected"
echo "✓ ping binary found at $(which ping)"

echo ""
echo "Installing backend dependencies..."
# Use --omit=dev to skip Electron build tools (electron, electron-builder) which
# are not needed for the server and pull in deprecated transitive dependencies.
npm install --omit=dev

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
