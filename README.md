# n8netwatch

**Night Network Watch** — A real-time IP and network host monitoring system with a web dashboard, historical metrics, and configurable email alerting.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Linux / macOS](#linux--macos)
    - [One-line install](#one-line-install-recommended)
    - [Manual installation](#manual-installation)
  - [Windows](#windows)
    - [One-line install (PowerShell)](#one-line-install-powershell)
    - [Manual installation (Windows)](#manual-installation-windows)
  - [Desktop App (Electron)](#desktop-app-electron)
- [Configuration](#configuration)
  - [General Settings](#general-settings)
  - [Targets](#targets)
  - [Server](#server)
  - [Alerts & Email Notifications](#alerts--email-notifications)
  - [Alert Rule Conditions](#alert-rule-conditions)
- [Running the Application](#running-the-application)
  - [Development](#development)
  - [Production with PM2](#production-with-pm2)
  - [Windows](#windows-1)
- [Maintenance](#maintenance)
  - [Flushing the database](#flushing-the-database)
- [Web Dashboard](#web-dashboard)
- [API Reference](#api-reference)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Features

- 📡 **Real-time ICMP Monitoring** — Pings multiple targets at a configurable interval and records min/avg/max latency, jitter, and packet loss.
- 📊 **Web Dashboard** — React-based UI displaying live metrics, sparkline charts, uptime percentages, and status indicators for every monitored host.
- 📜 **Historical Data** — Stores all ping results in a local SQLite database with configurable data retention (default 90 days).
- 🚨 **Flexible Alert Engine** — Define conditions using variables such as `avg_latency`, `packet_loss`, or `jitter`. Apply rules globally or to specific targets.
- 📧 **Email Notifications** — Sends HTML-formatted SMTP emails when alert conditions are triggered, with per-rule cooldowns to prevent notification spam.
- 🔄 **Live Config Reload** — Edit `config.yaml` while the application is running; changes to targets, intervals, and rules are applied automatically without a restart.
- 🔌 **WebSocket Push** — Real-time metric updates are pushed to all connected browser clients the moment each ping cycle completes.
- 📤 **CSV Export** — Download raw metrics data for any time range from the History page.

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js     | 18+            | [nodejs.org](https://nodejs.org) |
| `ping`      | System binary  | Pre-installed on Linux, macOS, Windows |
| npm         | Bundled with Node.js | |

> **Linux note:** If `ping` is not available, install it with `sudo apt install iputils-ping` (Debian/Ubuntu) or the equivalent for your distribution.

---

## Installation

---

## Linux / macOS

### One-line install (recommended)

Clone the repository and run the interactive setup — all in a single command:

**Using curl:**
```bash
curl -fsSL https://raw.githubusercontent.com/revul93/n8netwatch/main/install.sh | bash
```

**Using wget:**
```bash
wget -qO- https://raw.githubusercontent.com/revul93/n8netwatch/main/install.sh | bash
```

This will clone the repository into an `n8netwatch` directory in your current working directory, then launch the interactive setup automatically.

> **Security note:** As with any install-from-pipe command, you can review the script before running it:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/revul93/n8netwatch/main/install.sh
> ```

---

### Manual installation

#### 1. Clone the repository

```bash
git clone https://github.com/revul93/n8netwatch.git
cd n8netwatch
```

#### 2. Run the interactive setup script (recommended)

```bash
bash setup.sh
```

The script will:
1. Verify Node.js and `ping` are available.
2. Install backend dependencies (`npm install`).
3. Install and build the frontend (`cd client && npm install && npm run build`).
4. Copy `config.example.yaml` to `config.yaml`.
5. Optionally configure PM2 for production use.

#### 3. Manual setup (alternative)

```bash
# Install backend dependencies
npm install

# Install and build the React frontend
cd client && npm install && npm run build && cd ..

# Copy and edit the configuration file
cp config.example.yaml config.yaml
```

---

## Windows

### Prerequisites (Windows)

| Requirement | Notes |
|-------------|-------|
| Node.js 18+ | [nodejs.org](https://nodejs.org) — choose the Windows Installer (.msi) |
| Git          | [git-scm.com](https://git-scm.com/download/win) |
| Build Tools  | Run `npm install -g windows-build-tools` **as Administrator** (needed to compile native modules) |

> **Build Tools note:** `better-sqlite3` contains a native Node.js add-on and must be compiled on first install.
> The recommended way to obtain the required compiler toolchain on Windows is:
> ```powershell
> # Run as Administrator in PowerShell
> npm install -g windows-build-tools
> ```
> Alternatively, install **Visual Studio Build Tools** (C++ workload) from [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/).

> **`prebuild-install` deprecation notice:** During `npm install` you may see a warning:
> ```
> npm warn deprecated prebuild-install@7.1.3: No longer maintained.
> ```
> This is a known upstream issue in the `better-sqlite3` dependency. The package continues to work
> correctly. The warning will be resolved when `better-sqlite3` migrates its install mechanism. When
> building the Electron desktop app, `electron-rebuild` compiles `better-sqlite3` from source and
> the `prebuild-install` binary download is bypassed entirely.

---

### One-line install (PowerShell)

Open **PowerShell** (Windows Terminal or the built-in PowerShell app) and run:

```powershell
Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/revul93/n8netwatch/main/install.ps1" -UseBasicParsing).Content
```

This will clone the repository and launch the interactive `setup.ps1` automatically.

> **Security note:** You can review the script before running it:
> ```powershell
> Invoke-WebRequest -Uri "https://raw.githubusercontent.com/revul93/n8netwatch/main/install.ps1" -UseBasicParsing | Select-Object -ExpandProperty Content
> ```

---

### Manual installation (Windows)

#### 1. Clone the repository

```powershell
git clone https://github.com/revul93/n8netwatch.git
cd n8netwatch
```

#### 2. Run the interactive setup script

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

The script will:
1. Verify Node.js is installed (v18+).
2. Install backend dependencies (`npm install`).
3. Install and build the frontend.
4. Copy `config.example.yaml` to `config.yaml`.
5. Optionally start the application via PM2.

#### 3. Manual setup (alternative)

```powershell
# Install backend dependencies
npm install

# Install and build the React frontend
cd client; npm install; npm run build; cd ..

# Copy and edit the configuration file
Copy-Item config.example.yaml config.yaml
```

#### 4. Start the application

```cmd
# Option A — CMD double-click or command prompt
start.cmd

# Option B — PowerShell / Node.js directly
node server\index.js

# Option C — PM2 (recommended for production)
npm run pm2:start
```

Open `http://localhost:3000` in your browser.

---

## Desktop App (Electron)

n8netwatch can be run as a standalone Windows (or macOS/Linux) desktop application using [Electron](https://electronjs.org). The Electron wrapper embeds the Express server and opens the web dashboard in a native application window — no browser or separate server setup required.

### Run the desktop app in development

```bash
# 1. Build the frontend first (if not already done)
cd client && npm install && npm run build && cd ..

# 2. Install all dependencies (including Electron dev-deps)
npm install

# 3. Rebuild native modules for Electron's Node.js version
npm run electron:rebuild

# 4. Launch the desktop app
npm run electron
```

### Build a distributable installer

> **Requirements:** On Windows you need the same build tools as for the server install.

```bash
# Build for the current platform
npm run electron:build

# Build specifically for Windows (creates NSIS installer + portable .exe in dist-electron/)
npm run electron:build:win

# Build for macOS
npm run electron:build:mac

# Build for Linux (creates AppImage + .deb in dist-electron/)
npm run electron:build:linux
```

The Windows installer (`dist-electron/n8netwatch Setup *.exe`) is a standard NSIS installer with a Start Menu shortcut and an optional desktop shortcut.

### Automated builds with GitHub Actions

The repository ships a workflow (`.github/workflows/electron-build.yml`) that builds distributable packages for **Windows** and **Linux** automatically.

**Triggers:**
- **On tag push** — any tag matching `v*` (e.g. `v1.2.0`) triggers a full Windows + Linux build.
- **Manual dispatch** — run the workflow from the *Actions* tab and choose which platform to build for (`all`, `windows`, or `linux`).

**Artifacts** are uploaded after each run and can be downloaded from the workflow run page:

| Platform | Files |
|----------|-------|
| Windows  | `n8netwatch Setup <version>.exe`, `n8netwatch <version>.exe` (portable) |
| Linux    | `n8netwatch-<version>.AppImage`, `n8netwatch_<version>.deb` |

To trigger a release build locally:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Data directory (Electron)

When running as an Electron desktop app, n8netwatch stores its database and configuration in the OS user-data directory instead of the application bundle:

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%\n8netwatch` |
| macOS    | `~/Library/Application Support/n8netwatch` |
| Linux    | `~/.config/n8netwatch` |

Edit `config.yaml` in that directory to change targets, SMTP settings, or alert rules while the app is running.

---

## Configuration

All settings are stored in `config.yaml` at the project root. The file is watched at runtime — save your changes and they will be applied within a second without restarting the process.

See [`config.example.yaml`](config.example.yaml) for a fully annotated example.

### General Settings

```yaml
general:
  ping_interval: 30       # Seconds between ping cycles (integer, 1–59)
  ping_count: 5           # Packets sent per ping
  ping_timeout: 5         # Timeout in seconds per ping attempt
  data_retention_days: 90 # Days to keep historical ping results
```

### Targets

```yaml
targets:
  - name: "Google DNS"        # Display name shown in the dashboard
    ip: "8.8.8.8"             # IP address or resolvable hostname
    group: "DNS Servers"      # Optional group label for filtering
  - name: "Core Router"
    ip: "192.168.1.1"
    group: "Local Network"
```

### Server

```yaml
server:
  port: 3000          # HTTP port the application listens on
  host: "0.0.0.0"    # Bind address (0.0.0.0 = all interfaces)
```

### Alerts & Email Notifications

```yaml
alerts:
  email_notifications: true   # Set to false to disable all email alerts

  smtp:
    host: "smtp.gmail.com"
    port: 587
    secure: false             # true for port 465, false for STARTTLS (587)
    user: "you@gmail.com"
    pass: "app-password"      # Use an app-specific password, not your account password
                              # Avoid committing config.yaml with real credentials
    from: "n8netwatch <monitor@yourdomain.com>"
    to:
      - "admin@yourdomain.com"

  rules:
    - name: "Host Down"
      condition: "packet_loss == 100"
      severity: "critical"     # critical | warning
      cooldown: 300            # Minimum seconds between repeated alerts for the same target
      # targets: []            # Omit or leave empty to apply the rule to all targets

    - name: "High Latency"
      condition: "avg_latency > 200"
      severity: "warning"
      cooldown: 600
      targets:                 # Restrict rule to specific targets (name, IP, or numeric ID)
        - "Core Router"
```

### Alert Rule Conditions

Conditions are evaluated as JavaScript expressions. The following variables are available:

| Variable | Type | Description |
|----------|------|-------------|
| `is_alive` | `0` or `1` | Whether the host responded |
| `packet_loss` | `0`–`100` | Percentage of lost packets |
| `avg_latency` | number (ms) | Average round-trip time |
| `min_latency` | number (ms) | Minimum round-trip time |
| `max_latency` | number (ms) | Maximum round-trip time |
| `jitter` | number (ms) | `(max_latency - min_latency) / 2` |
| `packets_sent` | integer | Total packets sent |
| `packets_received` | integer | Total packets received |

**Examples:**

```yaml
condition: "packet_loss == 100"        # Host is completely unreachable
condition: "packet_loss > 20"          # More than 20% packet loss
condition: "avg_latency > 200"         # Average latency exceeds 200 ms
condition: "jitter > 50"               # Jitter exceeds 50 ms
condition: "is_alive == 0"             # Host not responding (equivalent to packet_loss == 100)
```

---

## Running the Application

### Development

```bash
npm start
# or
node server/index.js
```

The application will be available at `http://localhost:3000` (or the host/port set in `config.yaml`).

To run the frontend in hot-reload mode during development:

```bash
cd client
npm run dev   # Starts Vite dev server on http://localhost:5173
              # API requests are proxied to the backend on :3000
```

### Production with PM2

[PM2](https://pm2.keymetrics.io/) is the recommended process manager for production deployments. It handles automatic restarts, log rotation, and system startup integration.

```bash
# Install PM2 globally (one-time)
npm install -g pm2

# Start the application
npm run pm2:start

# View real-time logs
npm run pm2:logs

# Check status
npm run pm2:status

# Graceful reload (zero-downtime restart)
npm run pm2:reload

# Hard restart
npm run pm2:restart

# Stop the application
npm run pm2:stop
```

**Enable auto-start on system boot:**

```bash
npm run pm2:startup   # Generates and runs the systemd/launchd command
npm run pm2:save      # Saves the current process list
```

Application logs are written to `logs/out.log` (stdout) and `logs/error.log` (stderr).

---

### Windows

```cmd
REM Option A — CMD (double-click or command prompt)
start.cmd

REM Option B — Node.js directly
node server\index.js
```

```powershell
# Option C — PM2 (recommended)
npm run pm2:start
```

PM2 is supported on Windows. To enable auto-start on system boot, run:

```powershell
npm run pm2:startup
npm run pm2:save
```

> **PM2 on Windows:** If `pm2 startup` does not configure a Windows Service automatically,
> install the optional [pm2-installer](https://github.com/jessety/pm2-installer) package for
> native Windows Service support.

---

## Maintenance

### Flushing the database

The `db:flush` script permanently deletes **all** data (ping results, alerts, and targets) from the SQLite database and resets the auto-increment counters.  Use it to start fresh without reinstalling the application.

```bash
# Interactive — prompts for confirmation before deleting
npm run db:flush

# Skip the confirmation prompt (useful in automation / CI)
node scripts/flush-db.js --yes
```

> ⚠️ **This action is irreversible.** All historical ping results, stored alerts, and target records will be removed.  Back up `data/n8netwatch.db` first if you want to preserve the data.
>
> The running server process does not need to be stopped first — the script opens its own connection to the database.  However, after flushing you should restart the server so that it re-syncs targets from `config.yaml`.

---

## Web Dashboard

Once the application is running, open `http://<host>:3000` in your browser.

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Live grid of all monitored hosts with status, latency, jitter, and uptime |
| History | `/history` | Paginated table of historical ping results with filters and CSV export |
| Alerts | `/alerts` | Active and historical alerts with acknowledgement support; view configured rules |

---

## API Reference

All endpoints are prefixed with `/api` and return JSON.

### Targets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/targets` | List all targets with their latest metrics |
| `GET` | `/api/targets/:id` | Get details for a specific target |
| `GET` | `/api/targets/:id/metrics` | Get aggregated metrics for a target |
| `GET` | `/api/targets/:id/ping-results` | Get ping history for a target |

### Ping Results

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping-results` | Get historical results (supports filtering) |

### Alerts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/alerts` | List alert events |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge a specific alert |

### Dashboard & Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard` | Summary statistics (overall uptime, average latency, active alerts) |
| `GET` | `/api/export` | Export metrics to CSV |

### WebSocket

Connect to `ws://<host>:3000` to receive real-time push events (use `wss://` if the application is behind a TLS-terminating reverse proxy):

- **`ping_result`** — Emitted after each ping cycle with fresh metrics for all targets.
- **`alert`** — Emitted when an alert rule is triggered.
- **`config_reloaded`** — Emitted when `config.yaml` is reloaded.

---

## Tech Stack

### Backend

| Package | Purpose |
|---------|---------|
| [Express](https://expressjs.com) | HTTP server and REST API |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | High-performance SQLite database |
| [ws](https://github.com/websockets/ws) | WebSocket server |
| [node-cron](https://github.com/node-cron/node-cron) | Ping cycle scheduling |
| [ping](https://github.com/danielzzz/node-ping) | ICMP ping wrapper |
| [nodemailer](https://nodemailer.com) | SMTP email delivery |
| [js-yaml](https://github.com/nodeca/js-yaml) | YAML configuration parsing |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | API rate limiting |

### Frontend

| Package | Purpose |
|---------|---------|
| [React 18](https://react.dev) | UI framework |
| [Vite](https://vitejs.dev) | Build tool and dev server |
| [React Router](https://reactrouter.com) | Client-side routing |
| [Recharts](https://recharts.org) | Charts and sparklines |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first styling |
| [Lucide React](https://lucide.dev) | Icon library |
| [date-fns](https://date-fns.org) | Date formatting utilities |

### Desktop (Electron)

| Package | Purpose |
|---------|---------|
| [Electron](https://electronjs.org) | Cross-platform desktop shell |
| [electron-builder](https://www.electron.build) | Packaging and installer generation |
| [@electron/rebuild](https://github.com/electron/rebuild) | Recompiles native modules for Electron |

---

## License

This project is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for details.
