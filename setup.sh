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

# ── Interactive configuration ─────────────────────────────────────────────────
echo ""
echo "Would you like to interactively configure targets, SMTP, and alert settings?"
echo "  y) Yes — walk me through the configuration"
echo "  n) No  — keep default example settings (edit config.yaml manually later)"
printf "Choice [y/N]: "
read -r CONFIGURE_CHOICE

if [[ "$CONFIGURE_CHOICE" =~ ^[Yy]$ ]]; then

  # ── Targets ──────────────────────────────────────────────────────────────
  echo ""
  echo "─────────────────────────────────────────────────"
  echo "  TARGETS"
  echo "─────────────────────────────────────────────────"
  echo "Would you like to configure monitoring targets now?"
  printf "  [y/N]: "
  read -r DO_TARGETS

  if [[ "$DO_TARGETS" =~ ^[Yy]$ ]]; then
    # Start fresh targets list in config
    # Use a temporary file to build the targets block
    TARGETS_BLOCK=""
    while true; do
      echo ""
      printf "  Target name (e.g. 'Google DNS'): "
      read -r T_NAME
      [ -z "$T_NAME" ] && echo "  Name cannot be empty." && continue

      printf "  IP address or hostname (e.g. 8.8.8.8): "
      read -r T_IP
      [ -z "$T_IP" ] && echo "  IP cannot be empty." && continue

      printf "  Group (optional, press Enter to skip): "
      read -r T_GROUP

      if [ -n "$T_GROUP" ]; then
        TARGETS_BLOCK="${TARGETS_BLOCK}  - name: \"${T_NAME}\"\n    ip: \"${T_IP}\"\n    group: \"${T_GROUP}\"\n"
      else
        TARGETS_BLOCK="${TARGETS_BLOCK}  - name: \"${T_NAME}\"\n    ip: \"${T_IP}\"\n"
      fi

      printf "  Add another target? [y/N]: "
      read -r MORE_TARGETS
      [[ "$MORE_TARGETS" =~ ^[Yy]$ ]] || break
    done

    if [ -n "$TARGETS_BLOCK" ]; then
      # Write new targets section using a Python helper
      TARGETS_YAML=$(printf '%b' "$TARGETS_BLOCK")
      python3 -c "
import sys

targets_block = sys.argv[1]
with open('config.yaml', 'r') as f:
    lines = f.readlines()

# Find the 'targets:' top-level key and replace until the next top-level key
start = None
end = len(lines)
for i, line in enumerate(lines):
    if line.startswith('targets:'):
        start = i
    elif start is not None and line and line[0].isalpha() and not line.startswith(' '):
        end = i
        break

if start is None:
    print('  Warning: targets: section not found in config.yaml')
    sys.exit(0)

new_section = 'targets:\n' + targets_block.rstrip('\n') + '\n\n'
new_lines = lines[:start] + [new_section] + lines[end:]
with open('config.yaml', 'w') as f:
    f.writelines(new_lines)
print('  \u2713 Targets updated in config.yaml')
" "$TARGETS_YAML"
    fi
  fi

  # ── SMTP ──────────────────────────────────────────────────────────────────
  echo ""
  echo "─────────────────────────────────────────────────"
  echo "  SMTP (email notifications)"
  echo "─────────────────────────────────────────────────"
  echo "Would you like to configure SMTP for email alerts?"
  printf "  [y/N]: "
  read -r DO_SMTP

  if [[ "$DO_SMTP" =~ ^[Yy]$ ]]; then
    printf "  SMTP host (e.g. smtp.gmail.com): "
    read -r SMTP_HOST
    printf "  SMTP port [587]: "
    read -r SMTP_PORT
    SMTP_PORT="${SMTP_PORT:-587}"
    printf "  SMTP user (email address): "
    read -r SMTP_USER
    printf "  SMTP password / app-password: "
    read -rs SMTP_PASS
    echo ""
    printf "  From address (e.g. monitor@yourdomain.com): "
    read -r SMTP_FROM
    printf "  Alert recipient email: "
    read -r SMTP_TO

    python3 -c "
import sys, yaml

smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, smtp_to = sys.argv[1:7]

with open('config.yaml', 'r') as f:
    config = yaml.safe_load(f)

if 'alerts' not in config:
    config['alerts'] = {}
if 'smtp' not in config['alerts']:
    config['alerts']['smtp'] = {}

smtp = config['alerts']['smtp']
smtp['host'] = smtp_host
smtp['port'] = int(smtp_port)
smtp['user'] = smtp_user
smtp['pass'] = smtp_pass
smtp['from'] = smtp_from
smtp['to'] = [smtp_to]

with open('config.yaml', 'w') as f:
    yaml.dump(config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
print('  \u2713 SMTP settings updated in config.yaml')
" "$SMTP_HOST" "$SMTP_PORT" "$SMTP_USER" "$SMTP_PASS" "$SMTP_FROM" "$SMTP_TO"
  fi

  # ── Alert rules ───────────────────────────────────────────────────────────
  echo ""
  echo "─────────────────────────────────────────────────"
  echo "  ALERT RULES"
  echo "─────────────────────────────────────────────────"
  echo "Would you like to enable/disable the default alert rules?"
  echo "  (Default rules: Host Down, High Packet Loss, High Latency, High Jitter)"
  printf "  Keep default rules? [Y/n]: "
  read -r DO_ALERTS
  if [[ "$DO_ALERTS" =~ ^[Nn]$ ]]; then
    echo "  Skipping — you can customise alert rules in config.yaml later."
  else
    echo "  ✓ Default alert rules kept as-is."
  fi

  echo ""
  echo "✓ Interactive configuration complete."
  echo "  Review and fine-tune settings in config.yaml at any time."

else
  echo ""
  echo "  Skipping interactive setup — using default example settings."
  echo "  *** IMPORTANT: Edit config.yaml with your target IPs and SMTP settings ***"
fi

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
