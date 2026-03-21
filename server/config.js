'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

let _config = null;

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

  _config = config;
  return config;
}

function getConfig() {
  if (!_config) return loadConfig();
  return _config;
}

module.exports = { loadConfig, getConfig };
