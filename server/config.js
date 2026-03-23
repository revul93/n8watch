'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let _config = null;
let _configPath = null;

function loadConfig() {
  const configPath = path.join(__dirname, '..', 'config.yaml');
  const examplePath = path.join(__dirname, '..', 'config.example.yaml');

  let filePath;
  if (fs.existsSync(configPath)) {
    filePath = configPath;
  } else if (fs.existsSync(examplePath)) {
    console.warn('config.yaml not found, using config.example.yaml');
    filePath = examplePath;
  } else {
    throw new Error('No config file found. Create config.yaml from config.example.yaml');
  }

  _configPath = filePath;
  const raw = fs.readFileSync(filePath, 'utf8');
  const config = yaml.load(raw);

  if (!config.general) throw new Error('Config missing: general section');
  if (!config.targets || !Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error('Config missing: targets array');
  }
  if (!config.server) throw new Error('Config missing: server section');

  config.general.ping_interval = config.general.ping_interval || 30;
  config.general.ping_count = config.general.ping_count || 5;
  config.general.ping_timeout = config.general.ping_timeout || 5;
  config.general.data_retention_days = config.general.data_retention_days || 90;
  config.server.port = config.server.port || 3000;
  config.server.host = config.server.host || '0.0.0.0';

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

/**
 * watchConfig - watch config.yaml for changes and invoke callback on reload.
 * Uses fs.watch with a 500ms debounce to absorb the duplicate/spurious events
 * that many editors and platforms emit for a single save. For production systems
 * on network drives, consider replacing with the chokidar package.
 *
 * @param {function} onChange  called with the new config object after a successful reload
 */
function watchConfig(onChange) {
  if (!_configPath) loadConfig();

  let debounceTimer = null;

  fs.watch(_configPath, (eventType) => {
    if (eventType !== 'change') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const newConfig = loadConfig();
        console.log('[Config] Reloaded config.yaml');
        onChange(newConfig);
      } catch (err) {
        console.error('[Config] Failed to reload config.yaml:', err.message);
      }
    }, 500);
  });

  console.log(`[Config] Watching ${_configPath} for changes`);
}

module.exports = { loadConfig, getConfig, watchConfig };
