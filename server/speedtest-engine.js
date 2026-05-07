'use strict';

const { spawn, execFile } = require('child_process');
const { promisify }       = require('util');
const execFileAsync       = promisify(execFile);

// ── Binary availability ───────────────────────────────────────────────────────

/**
 * Resolve the absolute path of a binary, or null if it is not on PATH.
 * Works on POSIX (which) and Windows (where).
 */
async function findBinary(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, [name], { timeout: 5000 });
    const first = stdout.trim().split(/\r?\n/)[0];
    return first || null;
  } catch {
    return null;
  }
}

let _speedtestBin = undefined; // undefined = not yet checked
let _fastBin      = undefined;

async function isSpeedtestAvailable() {
  if (_speedtestBin === undefined) {
    _speedtestBin = await findBinary('speedtest-cli');
  }
  return _speedtestBin !== null;
}

async function isFastAvailable() {
  if (_fastBin === undefined) {
    _fastBin = await findBinary('fast');
  }
  return _fastBin !== null;
}

// ── Individual tool runners ───────────────────────────────────────────────────

/**
 * Run speedtest-cli and return { download, upload } in Mbps.
 * @param {string|null} sourceIp  Bind to this IP (--source flag); null = omit.
 */
function runSpeedtestCli(sourceIp) {
  return new Promise((resolve, reject) => {
    const args = ['--json', '--secure'];
    if (sourceIp) args.push('--source', sourceIp);

    const proc  = spawn('speedtest-cli', args, { timeout: 120000 });
    let stdout   = '';
    let stderr   = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('error', err => reject(new Error(`speedtest-cli spawn failed: ${err.message}`)));

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`speedtest-cli exited ${code}: ${stderr.trim() || 'no output'}`));
      }
      try {
        const data     = JSON.parse(stdout.trim());
        // speedtest-cli reports bits/s; convert to Mbps
        const download = (data.download || 0) / 1e6;
        const upload   = (data.upload   || 0) / 1e6;
        resolve({ download, upload });
      } catch (e) {
        reject(new Error(`speedtest-cli JSON parse error: ${e.message}`));
      }
    });
  });
}

/**
 * Run fast-cli and return { download, upload } in Mbps.
 * fast-cli ≥1.0 writes line-separated JSON objects.
 * @param {string|null} _sourceIp  fast-cli does not support binding to a source IP.
 */
function runFastCli(_sourceIp) {
  return new Promise((resolve, reject) => {
    // fast --upload outputs multiple JSON lines; we want the final result
    const proc  = spawn('fast', ['--upload', '--json'], { timeout: 120000 });
    let stdout   = '';
    let stderr   = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('error', err => reject(new Error(`fast spawn failed: ${err.message}`)));

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`fast exited ${code}: ${stderr.trim() || 'no output'}`));
      }
      try {
        // fast-cli outputs one JSON object per line; use the last complete line
        const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
        const last  = lines[lines.length - 1];
        const data  = JSON.parse(last);

        // fast-cli reports in Mbps already (downloadSpeed / uploadSpeed)
        const download = Number(data.downloadSpeed) || 0;
        const upload   = Number(data.uploadSpeed)   || 0;
        resolve({ download, upload });
      } catch (e) {
        reject(new Error(`fast-cli JSON parse error: ${e.message}`));
      }
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run internet speed test(s) according to the current config and return a
 * result object suitable for inserting into the database.
 *
 * @param {object} config  Full application config (uses config.speedtest sub-key).
 * @returns {Promise<{ download: number|null, upload: number|null, tool: string, interface: string|null, created_at: number }>}
 */
async function runSpeedtest(config) {
  const st        = (config && config.speedtest) || {};
  const tool      = (st.tool      || 'speedtest').toLowerCase();
  const iface     = st.interface  || null;
  const created_at = Date.now();

  // Resolve the IPv4 address of the chosen interface so we can pass it as
  // --source to speedtest-cli (the flag expects an IP, not an interface name).
  let sourceIp = null;
  if (iface && Array.isArray(config.interfaces)) {
    const found = config.interfaces.find(i => i.name === iface);
    sourceIp = (found && found.ipv4) ? found.ipv4 : null;
  }

  let download = null;
  let upload   = null;

  if (tool === 'both') {
    // Run both tools; average the results — skip failures gracefully
    const results = await Promise.allSettled([
      runSpeedtestCli(sourceIp),
      runFastCli(null),           // fast-cli has no --source support
    ]);

    const good = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    if (good.length === 0) {
      const msgs = results.map(r => r.reason?.message || 'unknown error');
      throw new Error(`Both speedtest tools failed: ${msgs.join('; ')}`);
    }

    download = good.reduce((s, r) => s + r.download, 0) / good.length;
    upload   = good.reduce((s, r) => s + r.upload,   0) / good.length;

  } else if (tool === 'fast') {
    const result = await runFastCli(null);
    download = result.download;
    upload   = result.upload;

  } else {
    // Default: speedtest-cli
    const result = await runSpeedtestCli(sourceIp);
    download = result.download;
    upload   = result.upload;
  }

  return {
    download:   Math.round(download * 100) / 100,
    upload:     Math.round(upload   * 100) / 100,
    tool,
    interface:  iface,
    created_at,
  };
}

module.exports = { runSpeedtest, isSpeedtestAvailable, isFastAvailable };
