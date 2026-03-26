'use strict';

const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

// ── Configuration ─────────────────────────────────────────────────────────────

const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL  = `http://localhost:${SERVER_PORT}`;

// Store data in the OS user-data directory (e.g. %APPDATA%\n8netwatch on Windows)
const DATA_DIR = app.getPath('userData');
process.env.N8NETWATCH_DATA_DIR = DATA_DIR;

// ── First-run: copy config.example.yaml → user-data dir ──────────────────────

function ensureConfig() {
  const fs  = require('fs');
  const dst = path.join(DATA_DIR, 'config.yaml');
  if (!fs.existsSync(dst)) {
    const src = path.join(__dirname, '..', 'config.example.yaml');
    if (fs.existsSync(src)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.copyFileSync(src, dst);
      console.log(`[electron] Created default config at ${dst}`);
    }
  }
}

// ── Server process ────────────────────────────────────────────────────────────

let serverProcess = null;
let mainWindow    = null;
let tray          = null;

function startServer() {
  const serverEntry = path.join(__dirname, '..', 'server', 'index.js');

  serverProcess = fork(serverEntry, [], {
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ELECTRON: '1',
    },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (data) => {
    process.stdout.write(`[server] ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    process.stderr.write(`[server] ${data}`);
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[electron] Server process exited with code ${code}`);
    }
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ── Wait for the server to be ready ──────────────────────────────────────────

function waitForServer(url, retries = 30, delay = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (attempts >= retries) {
          reject(new Error(`Server did not start after ${retries} attempts`));
        } else {
          setTimeout(check, delay);
        }
      });
    };

    check();
  });
}

// ── Create the main window ────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'n8netwatch',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(SERVER_URL);

  // Open external links in the default browser, not in the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Build the application menu
  const menu = Menu.buildFromTemplate(buildMenuTemplate());
  Menu.setApplicationMenu(menu);
}

// ── Tray icon ─────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'tray.png');
  const icon     = nativeImage.createFromPath(iconPath);

  // Skip tray creation if no icon file is present (e.g. development without icons)
  if (icon.isEmpty()) {
    console.log('[electron] Tray icon not found — skipping tray creation');
    return;
  }

  tray = new Tray(icon);
  tray.setToolTip('n8netwatch');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open n8netwatch',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// ── Application menu ──────────────────────────────────────────────────────────

function buildMenuTemplate() {
  return [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Dashboard',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow && mainWindow.loadURL(SERVER_URL),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'View on GitHub',
          click: () => shell.openExternal('https://github.com/revul93/n8netwatch'),
        },
      ],
    },
  ];
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  ensureConfig();
  startServer();

  try {
    await waitForServer(SERVER_URL);
  } catch (err) {
    console.error('[electron] Could not connect to server:', err.message);
    // Still attempt to open the window — the page will show an error and can be reloaded
  }

  createWindow();
  createTray();

  app.on('activate', () => {
    // macOS: re-create the window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS keep the app running in the tray when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

app.on('will-quit', () => {
  stopServer();
});
