'use strict';

const nodemailer = require('nodemailer');
const { formatDuration, formatDateTime } = require('./utils/helpers');

let _transporter = null;
let _smtpConfig = null;
let _emailEnabled = false;

/**
 * initEmail - (re)initialise the SMTP transporter from the current config.
 * Safe to call on live-reload; any in-flight emails that have already been
 * handed to nodemailer will complete via their own copy of the transporter.
 */
function initEmail(smtpConfig) {
  _transporter = null;
  _smtpConfig  = null;
  _emailEnabled = false;

  if (!smtpConfig || !smtpConfig.host) {
    console.warn('[Email] SMTP not configured — email alerts disabled.');
    return;
  }

  _smtpConfig  = smtpConfig;
  _emailEnabled = true;
  _transporter = nodemailer.createTransport({
    host:   smtpConfig.host,
    port:   smtpConfig.port || 587,
    secure: smtpConfig.secure || false,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  console.log('[Email] SMTP transporter initialized');
}

async function sendAlertEmail(target, rule, metrics) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to) ? _smtpConfig.to : [_smtpConfig.to];
  const subject = `[n8netwatch] ${rule.severity.toUpperCase()}: ${rule.name} — ${target.name} (${target.ip})`;

  const metricRows = Object.entries(metrics)
    .map(([k, v]) => `<tr><td style="padding:4px 8px;border:1px solid #ddd">${k}</td><td style="padding:4px 8px;border:1px solid #ddd">${v !== null && v !== undefined ? v : 'N/A'}</td></tr>`)
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:${rule.severity === 'critical' ? '#d32f2f' : '#f57c00'}">
        ⚠️ Alert: ${rule.name}
      </h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Target</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${target.name}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">IP</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${target.ip}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Severity</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${rule.severity}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Condition</td>
            <td style="padding:4px 8px;border:1px solid #ddd"><code>${rule.condition}</code></td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Time</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${formatDateTime(new Date())}</td></tr>
      </table>
      <h3>Current Metrics</h3>
      <table style="border-collapse:collapse;width:100%">
        ${metricRows}
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent by n8netwatch</p>
    </div>
  `;

  try {
    await _transporter.sendMail({
      from:    _smtpConfig.from,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[Email] Alert sent: ${subject}`);
  } catch (err) {
    console.error('[Email] Failed to send alert email:', err.message);
  }
}

async function sendRecoveryEmail(target, alert, downtimeDuration) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to) ? _smtpConfig.to : [_smtpConfig.to];
  const subject = `[n8netwatch] RESOLVED: ${alert.rule_name} — ${target.name} (${target.ip})`;
  const downtime = formatDuration(downtimeDuration);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#388e3c">✅ Resolved: ${alert.rule_name}</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Target</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${target.name}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">IP</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${target.ip}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Downtime Duration</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${downtime}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Resolved At</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${formatDateTime(new Date())}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent by n8netwatch</p>
    </div>
  `;

  try {
    await _transporter.sendMail({
      from:    _smtpConfig.from,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[Email] Recovery sent: ${subject}`);
  } catch (err) {
    console.error('[Email] Failed to send recovery email:', err.message);
  }
}

async function sendSystemStartEmail() {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to) ? _smtpConfig.to : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = '[n8netwatch] Monitoring System Started';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#1976d2">🚀 n8netwatch Started</h2>
      <p>The n8netwatch monitoring system has started successfully.</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Started At</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${now}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent by n8netwatch</p>
    </div>
  `;

  try {
    await _transporter.sendMail({
      from:    _smtpConfig.from,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[Email] System start notification sent`);
  } catch (err) {
    console.error('[Email] Failed to send system start email:', err.message);
  }
}

async function sendSystemShutdownEmail() {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to) ? _smtpConfig.to : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = '[n8netwatch] Monitoring System Shutting Down';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#f57c00">🛑 n8netwatch Shutting Down</h2>
      <p>The n8netwatch monitoring system is shutting down.</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Shutdown At</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${now}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent by n8netwatch</p>
    </div>
  `;

  try {
    await _transporter.sendMail({
      from:    _smtpConfig.from,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[Email] System shutdown notification sent`);
  } catch (err) {
    console.error('[Email] Failed to send system shutdown email:', err.message);
  }
}

async function sendReconnectEmail(disconnectedAt) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to) ? _smtpConfig.to : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = '[n8netwatch] Network Connectivity Restored';
  const downtime = disconnectedAt ? formatDuration(Date.now() - disconnectedAt) : 'unknown';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#388e3c">🌐 Network Connectivity Restored</h2>
      <p>The n8netwatch monitoring system has regained network connectivity — monitored targets are reachable again.</p>
      <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Reconnected At</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${now}</td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd;font-weight:bold">Disconnection Duration</td>
            <td style="padding:4px 8px;border:1px solid #ddd">${downtime}</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:24px">Sent by n8netwatch</p>
    </div>
  `;

  try {
    await _transporter.sendMail({
      from:    _smtpConfig.from,
      to:      recipients.join(', '),
      subject,
      html,
    });
    console.log(`[Email] Reconnect notification sent`);
  } catch (err) {
    console.error('[Email] Failed to send reconnect email:', err.message);
  }
}

function isEnabled() {
  return _emailEnabled;
}

module.exports = { initEmail, sendAlertEmail, sendRecoveryEmail, sendSystemStartEmail, sendSystemShutdownEmail, sendReconnectEmail, isEnabled };
