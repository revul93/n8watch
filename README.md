# n8watch — FortiGate Network Monitor

A lightweight, self-hosted monitoring system for FortiGate firewalls. Polls interface status and gateway reachability via the FortiOS REST API (with SSH fallback), stores data in SQLite, and serves a React dashboard.

## Architecture

```
┌─────────────────────┐     SQLite (WAL)    ┌─────────────────────┐
│   poller/main.py    │ ──────────────────► │   api/main.py       │
│  (systemd service)  │   /var/lib/forti-   │  FastAPI + React    │
│                     │   monitor/monitor.db │  (systemd service)  │
│  • FortiOS REST API │                     │                     │
│  • SSH fallback     │                     │  GET /api/latest    │
│  • Ping via SSH     │                     │  GET /api/history/* │
└─────────────────────┘                     └─────────────────────┘
```

## Features

- **Interface monitoring** — admin status + physical link status for each interface
- **Ping / gateway monitoring** — packet loss, RTT (min/avg/max) via FortiOS `execute ping`
- **Dual-source polling** — FortiOS REST API primary, SSH fallback
- **SQLite storage** — WAL mode, configurable retention (default 30 days)
- **React dashboard** — realtime tiles, auto-refreshing charts, historical drill-down
- **systemd integration** — graceful shutdown on SIGTERM, journal logging

## Repository Structure

```
n8watch/
├── config.example.yaml        # Configuration template
├── schema.sql                 # Database schema
├── shared/                    # Shared Python modules
│   ├── config.py              # YAML loader with env var substitution
│   └── db.py                  # SQLite helpers
├── poller/                    # Polling service
│   ├── main.py                # Main loop
│   ├── fortigate_api.py       # FortiOS REST API client
│   ├── fortigate_ssh.py       # SSH client (paramiko)
│   └── requirements.txt
├── api/                       # FastAPI backend
│   ├── main.py
│   ├── deps.py
│   ├── routers/
│   │   ├── health.py
│   │   ├── latest.py
│   │   └── history.py
│   └── requirements.txt
├── dashboard/                 # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── pages/Realtime.jsx
│       └── pages/History.jsx
├── systemd/                   # systemd unit files
│   ├── forti-poller.service
│   └── forti-api.service
└── scripts/
    └── setup.sh               # Ubuntu 22.04 setup script
```

## Quick Start

### Production (Ubuntu 22.04)

```bash
git clone https://github.com/your-org/n8watch.git
cd n8watch
sudo bash scripts/setup.sh
# Edit /etc/forti-monitor/config.yaml
sudo systemctl restart forti-poller forti-api
```

### Development

**Backend:**
```bash
# Install Python deps
pip install -r poller/requirements.txt -r api/requirements.txt

# Copy and edit config
cp config.example.yaml config.yaml
export FORTI_CONFIG=./config.yaml
export FORTIGATE_API_TOKEN=your_token_here

# Run poller
python -m poller.main

# Run API (separate terminal)
uvicorn api.main:app --reload --port 8000
```

**Dashboard:**
```bash
cd dashboard
npm install
npm run dev   # proxies /api/* to localhost:8000
```

## Configuration

Copy `config.example.yaml` and set:

| Key | Default | Description |
|-----|---------|-------------|
| `fortigate.host` | `192.168.1.1` | FortiGate management IP |
| `fortigate.api_token` | `${FORTIGATE_API_TOKEN}` | REST API token |
| `fortigate.verify_ssl` | `false` | Verify TLS cert |
| `fortigate.ssh.*` | — | SSH credentials for fallback |
| `interfaces` | `[]` | List of interface names to monitor |
| `gateways` | `[]` | List of `{name, ip}` targets to ping |
| `polling_interval_seconds` | `30` | Poll cadence |
| `ping_count` | `5` | Packets per ping |
| `retention_days` | `30` | How long to keep data |
| `sqlite_path` | `/var/lib/forti-monitor/monitor.db` | DB location |
| `server.port` | `8000` | API listen port |

### SSH Host Key Setup

Before the poller can connect via SSH, the FortiGate's host key must be trusted. Add it with:

```bash
# Add FortiGate host key to the dedicated known_hosts file
ssh-keyscan -H 192.168.1.1 >> /etc/forti-monitor/known_hosts
chown forti-monitor:forti-monitor /etc/forti-monitor/known_hosts
chmod 600 /etc/forti-monitor/known_hosts
```

Then reference it in `config.yaml`:

```yaml
fortigate:
  ssh:
    known_hosts_file: "/etc/forti-monitor/known_hosts"
```

Alternatively, set `verify_host_key: true` if the FortiGate is already in the system `~/.ssh/known_hosts`.

### Environment Variable Substitution

Any `${VAR}` in the config YAML is replaced with the corresponding environment variable at load time. Use the `EnvironmentFile` in the systemd unit (`/etc/forti-monitor/env`):

```
FORTIGATE_API_TOKEN=your_token_here
FORTIGATE_SSH_PASSWORD=optional_password
```

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/latest` | Latest interface + ping status |
| `GET /api/history/interfaces` | Interface samples (filters: `iface`, `from`, `to`) |
| `GET /api/history/pings` | Ping samples (filters: `target`, `from`, `to`) |
| `GET /api/history/interfaces/series` | Time-bucketed interface series |
| `GET /api/history/pings/series` | Time-bucketed ping series |

## Interface States

| State | Meaning |
|-------|---------|
| `UP` | Admin enabled, physical link up |
| `LINK_DOWN` | Admin enabled, no physical link |
| `ADMIN_DOWN` | Administratively disabled |

## License

MIT
