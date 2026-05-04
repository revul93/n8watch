"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const crypto = require("crypto");

let _config = null;
let _configPath = null;
let _lastContentHash = null;

function loadConfig() {
  // If n8watch_DATA_DIR is set, use it as the base directory for config.yaml.
  const baseDir = process.env.n8watch_DATA_DIR
    ? path.resolve(process.env.n8watch_DATA_DIR)
    : path.join(__dirname, "..");
  const configPath = path.join(baseDir, "config.yaml");
  const examplePath = path.join(__dirname, "..", "config.example.yaml");

  let filePath;
  if (fs.existsSync(configPath)) {
    filePath = configPath;
  } else if (fs.existsSync(examplePath)) {
    console.warn("config.yaml not found, using config.example.yaml");
    filePath = examplePath;
  } else {
    throw new Error(
      "No config file found. Create config.yaml from config.example.yaml",
    );
  }

  _configPath = filePath;
  const raw = fs.readFileSync(filePath, "utf8");
  _lastContentHash = crypto.createHash("md5").update(raw).digest("hex");
  const config = yaml.load(raw);

  if (!config.general) throw new Error("Config missing: general section");
  if (
    !config.targets ||
    !Array.isArray(config.targets) ||
    config.targets.length === 0
  ) {
    throw new Error("Config missing: targets array");
  }
  if (!config.server) throw new Error("Config missing: server section");

  config.general.ping_interval = config.general.ping_interval || 30;
  config.general.ping_count = config.general.ping_count || 5;
  config.general.ping_timeout = config.general.ping_timeout || 5;
  config.general.ping_concurrency = config.general.ping_concurrency || 0;
  config.general.data_retention_days = config.general.data_retention_days || 90;
  config.general.max_user_target_lifetime_days = config.general.max_user_target_lifetime_days || 7;
  config.server.port = config.server.port || 3000;
  config.server.host = config.server.host || "0.0.0.0";

  // Security — optional section, defaults to allowlist disabled
  if (!config.security) config.security = {};
  if (!config.security.ip_allowlist) config.security.ip_allowlist = { enabled: false, entries: [] };
  if (typeof config.security.ip_allowlist.enabled !== 'boolean') config.security.ip_allowlist.enabled = false;
  if (!Array.isArray(config.security.ip_allowlist.entries)) config.security.ip_allowlist.entries = [];

  // Dashboard visibility — optional section, defaults to all visible
  if (!config.dashboard) config.dashboard = {};
  if (!config.dashboard.visibility) config.dashboard.visibility = {};
  const vis = config.dashboard.visibility;
  if (vis.summary  === undefined) vis.summary  = true;
  if (vis.chart    === undefined) vis.chart    = true;
  if (vis.groups   === undefined) vis.groups   = true;
  if (vis.hosts    === undefined) vis.hosts    = true;

  // Validate SSL config when enabled
  if (config.server.ssl && config.server.ssl.enabled) {
    if (!config.server.ssl.cert) {
      throw new Error("SSL enabled but config.server.ssl.cert is missing");
    }
    if (!config.server.ssl.key) {
      throw new Error("SSL enabled but config.server.ssl.key is missing");
    }
  }

  // Default email_notifications to true if not explicitly set
  if (config.alerts) {
    if (config.alerts.email_notifications === undefined) {
      config.alerts.email_notifications = true;
    }
  }

  _config = config;
  return config;
}

function getConfig() {
  if (!_config) return loadConfig();
  return _config;
}

// Track watchers so watchConfig can only be registered once
let _watchActive = false;

/**
 * watchConfig - watch config.yaml for changes and invoke callback on reload.
 * Uses fs.watch with a 500ms debounce to absorb the duplicate/spurious events
 * that many editors and platforms emit for a single save. For production systems
 * on network drives, consider replacing with the chokidar package.
 *
 * Additionally, a 30-second polling interval is used as a fallback to catch
 * changes that fs.watch may miss (e.g. on network drives, certain editors, or
 * platforms where inotify events are unreliable).
 *
 * @param {function} onChange  called with the new config object after a successful reload
 */
function watchConfig(onChange) {
  if (!_configPath) loadConfig();

  // Guard: set up watchers only once to avoid duplicate polling timers
  if (_watchActive) return;
  _watchActive = true;

  let debounceTimer = null;

  function tryReload(source) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const raw = fs.readFileSync(_configPath, "utf8");
        const hash = crypto.createHash("md5").update(raw).digest("hex");
        if (hash === _lastContentHash) return; // content unchanged
        const newConfig = loadConfig(); // updates _lastContentHash
        console.log(`[Config] Reloaded config.yaml (detected by ${source})`);
        onChange(newConfig);
      } catch (err) {
        console.error("[Config] Failed to reload config.yaml:", err.message);
      }
    }, 500);
  }

  // Primary: inotify / kqueue / FSEvents-based watch
  fs.watch(_configPath, (eventType) => {
    if (eventType !== "change") return;
    tryReload("fs.watch");
  });

  // Fallback: poll every 30 seconds for environments where fs.watch is unreliable
  setInterval(() => tryReload("poll"), 30000);

  console.log(
    `[Config] Watching ${_configPath} for changes (fs.watch + 30s poll)`,
  );
}

/**
 * saveConfig - write the in-memory config back to config.yaml.
 * NOTE: js-yaml.dump() does not preserve comments from the original file.
 * Users who manage config.yaml manually should be aware that saving via the
 * Settings dashboard will replace it with a comment-free YAML representation.
 * The file is written atomically (tmp → rename) to prevent corruption.
 *
 * @param {object} config  The config object to serialise
 */
function saveConfig(config) {
  if (!_configPath) loadConfig();

  const raw = yaml.dump(config, { lineWidth: 120, quotingType: '"', forceQuotes: false });

  // Atomic write: write to a temp file then rename
  const tmpPath = _configPath + '.tmp';
  fs.writeFileSync(tmpPath, raw, 'utf8');
  fs.renameSync(tmpPath, _configPath);

  // Update the hash so the watcher does not re-trigger immediately
  _lastContentHash = crypto.createHash('md5').update(raw).digest('hex');
  _config = config;
}

module.exports = { loadConfig, getConfig, watchConfig, saveConfig };
