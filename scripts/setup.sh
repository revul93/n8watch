#!/usr/bin/env bash
set -euo pipefail

# n8watch Setup Script for Ubuntu 22.04
# Run as root: sudo bash scripts/setup.sh

INSTALL_DIR="/opt/n8watch"
CONFIG_DIR="/etc/n8watch"
DATA_DIR="/var/lib/n8watch"
SERVICE_USER="n8watch"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { echo "[$(date +'%H:%M:%S')] $*"; }

# ── 1. System packages ────────────────────────────────────────────────────────
log "Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nodejs npm build-essential curl

# ── 2. Service user ───────────────────────────────────────────────────────────
log "Creating service user '${SERVICE_USER}'..."
if ! id "${SERVICE_USER}" &>/dev/null; then
    useradd -r -s /bin/false -d "${INSTALL_DIR}" "${SERVICE_USER}"
fi

# ── 3. Directories ────────────────────────────────────────────────────────────
log "Creating directories..."
mkdir -p "${INSTALL_DIR}" "${CONFIG_DIR}" "${DATA_DIR}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${DATA_DIR}"
chmod 750 "${CONFIG_DIR}"

# ── 4. Copy application files ─────────────────────────────────────────────────
log "Copying application files..."
rsync -a --delete \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'node_modules' \
    --exclude 'dashboard/dist' \
    --exclude '.env' \
    "${REPO_DIR}/" "${INSTALL_DIR}/"

# ── 5. Python virtual environment ─────────────────────────────────────────────
log "Creating Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip -q

log "Installing Python dependencies..."
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/poller/requirements.txt" -q
"${INSTALL_DIR}/venv/bin/pip" install -r "${INSTALL_DIR}/api/requirements.txt" -q

# ── 6. React dashboard ────────────────────────────────────────────────────────
log "Building React dashboard..."
cd "${INSTALL_DIR}/dashboard"
npm install --silent
npm run build --silent
cd "${INSTALL_DIR}"

# ── 7. Initialize database ────────────────────────────────────────────────────
log "Initializing database..."
if [ ! -f "${DATA_DIR}/monitor.db" ]; then
    sudo -u "${SERVICE_USER}" "${INSTALL_DIR}/venv/bin/python" -c "
import sys; sys.path.insert(0, '${INSTALL_DIR}')
from shared.db import init_db
init_db('${DATA_DIR}/monitor.db')
print('Database initialized.')
"
fi

# ── 8. Config file ────────────────────────────────────────────────────────────
if [ ! -f "${CONFIG_DIR}/config.yaml" ]; then
    log "Copying example config to ${CONFIG_DIR}/config.yaml (edit before starting)"
    cp "${INSTALL_DIR}/config.example.yaml" "${CONFIG_DIR}/config.yaml"
    chmod 640 "${CONFIG_DIR}/config.yaml"
    chown "root:${SERVICE_USER}" "${CONFIG_DIR}/config.yaml"
fi

# ── 9. Systemd services ───────────────────────────────────────────────────────
log "Installing systemd services..."
cp "${INSTALL_DIR}/systemd/n8watch-poller.service" /etc/systemd/system/
cp "${INSTALL_DIR}/systemd/n8watch-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable n8watch-poller.service n8watch-api.service

# ── 10. Ownership ─────────────────────────────────────────────────────────────
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${INSTALL_DIR}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${DATA_DIR}"

# ── 11. Start services ────────────────────────────────────────────────────────
log "Starting services..."
systemctl start n8watch-poller.service n8watch-api.service

log "✅ Setup complete!"
log ""
log "Next steps:"
log "  1. Edit ${CONFIG_DIR}/config.yaml with your FortiGate details"
log "  2. Set FORTIGATE_API_TOKEN in ${CONFIG_DIR}/env (EnvironmentFile)"
log "  3. Add the FortiGate SSH host key (required for SSH polling):"
log "       ssh-keyscan -H <fortigate_ip> >> ${CONFIG_DIR}/known_hosts"
log "       chown ${SERVICE_USER}:${SERVICE_USER} ${CONFIG_DIR}/known_hosts"
log "     Then set 'known_hosts_file: ${CONFIG_DIR}/known_hosts' in config.yaml"
log "  4. Restart services: systemctl restart n8watch-poller n8watch-api"
log "  5. View dashboard at http://$(hostname -I | awk '{print $1}'):8000"
log ""
log "Service logs:"
log "  journalctl -u n8watch-poller -f"
log "  journalctl -u n8watch-api -f"
