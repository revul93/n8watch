"use strict";

const nodemailer = require("nodemailer");
const { formatDuration, formatDateTime } = require("./utils/helpers");

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
  _smtpConfig = null;
  _emailEnabled = false;

  if (!smtpConfig || !smtpConfig.host) {
    console.warn("[Email] SMTP not configured — email alerts disabled.");
    return;
  }

  _smtpConfig = smtpConfig;
  _emailEnabled = true;
  _transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: smtpConfig.secure || false,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  console.log("[Email] SMTP transporter initialized");
}

async function sendAlertEmail(target, rule, metrics) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to)
    ? _smtpConfig.to
    : [_smtpConfig.to];
  const subject = `[n8watch] ${rule.severity.toUpperCase()}: ${rule.name} — ${target.name} (${target.ip})`;

  const accentColor = rule.severity === "critical" ? "#ef4444" : "#f97316";
  const accentBg    = rule.severity === "critical" ? "#fef2f2" : "#fff7ed";
  const accentBorder= rule.severity === "critical" ? "#fca5a5" : "#fdba74";

  const metricRows = Object.entries(metrics)
    .map(([k, v], idx) => `
      <tr style="background:${idx % 2 === 0 ? "#f9fafb" : "#ffffff"}">
        <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb;width:40%">${k}</td>
        <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-family:monospace">${v !== null && v !== undefined ? v : "N/A"}</td>
      </tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header bar -->
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:20px 28px;text-align:left">
            <span style="font-size:13px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase">n8watch</span>
            <span style="float:right;font-size:11px;background:${accentBg};color:${accentColor};border:1px solid ${accentBorder};border-radius:20px;padding:3px 10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">${rule.severity}</span>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:${accentBg};border-left:4px solid ${accentColor};border-right:1px solid #e5e7eb;padding:20px 28px">
            <p style="margin:0;font-size:22px;font-weight:700;color:${accentColor}">⚠️ Alert: ${rule.name}</p>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280">${target.name} &bull; ${target.ip}</p>
          </td>
        </tr>

        <!-- Details table -->
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;width:40%">Field</td>
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Value</td>
              </tr>
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Target</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${target.name}</td>
              </tr>
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">IP</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-family:monospace">${target.ip}</td>
              </tr>
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Severity</td>
                <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid #e5e7eb">
                  <span style="background:${accentBg};color:${accentColor};border:1px solid ${accentBorder};border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;text-transform:uppercase">${rule.severity}</span>
                </td>
              </tr>
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Condition</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-family:monospace">${rule.condition}</td>
              </tr>
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Time</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${formatDateTime(new Date())}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Metrics section -->
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:20px 16px 0">
            <p style="margin:0 0 12px 0;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.04em;text-transform:uppercase">Current Metrics</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
              ${metricRows}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Sent by <strong style="color:#6b7280">n8watch</strong></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await _transporter.sendMail({
      from: _smtpConfig.from,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[Email] Alert sent: ${subject}`);
  } catch (err) {
    console.error("[Email] Failed to send alert email:", err.message);
  }
}

async function sendRecoveryEmail(target, alert, downtimeDuration) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to)
    ? _smtpConfig.to
    : [_smtpConfig.to];
  const subject = `[n8watch] RESOLVED: ${alert.rule_name} — ${target.name} (${target.ip})`;
  const downtime = formatDuration(downtimeDuration);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

        <!-- Header bar -->
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:20px 28px;text-align:left">
            <span style="font-size:13px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase">n8watch</span>
            <span style="float:right;font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:3px 10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase">Resolved</span>
          </td>
        </tr>

        <!-- Recovery banner -->
        <tr>
          <td style="background:#f0fdf4;border-left:4px solid #22c55e;border-right:1px solid #e5e7eb;padding:20px 28px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#16a34a">✅ Resolved: ${alert.rule_name}</p>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280">${target.name} &bull; ${target.ip}</p>
          </td>
        </tr>

        <!-- Details table -->
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb;width:40%">Field</td>
                <td style="padding:10px 16px;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase;border-bottom:1px solid #e5e7eb">Value</td>
              </tr>
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Target</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${target.name}</td>
              </tr>
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">IP</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-family:monospace">${target.ip}</td>
              </tr>
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb">Downtime Duration</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600">${downtime}</td>
              </tr>
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500">Resolved At</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827">${formatDateTime(new Date())}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Sent by <strong style="color:#6b7280">n8watch</strong></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await _transporter.sendMail({
      from: _smtpConfig.from,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[Email] Recovery sent: ${subject}`);
  } catch (err) {
    console.error("[Email] Failed to send recovery email:", err.message);
  }
}

async function sendSystemStartEmail() {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to)
    ? _smtpConfig.to
    : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = "[n8watch] Monitoring System Started";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:20px 28px">
            <span style="font-size:13px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase">n8watch</span>
          </td>
        </tr>
        <tr>
          <td style="background:#eff6ff;border-left:4px solid #3b82f6;border-right:1px solid #e5e7eb;padding:20px 28px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#1d4ed8">🚀 Monitoring System Started</p>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280">n8watch is now actively monitoring your targets.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb;width:40%">Started At</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${now}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Sent by <strong style="color:#6b7280">n8watch</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await _transporter.sendMail({
      from: _smtpConfig.from,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[Email] System start notification sent`);
  } catch (err) {
    console.error("[Email] Failed to send system start email:", err.message);
  }
}

async function sendSystemShutdownEmail() {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to)
    ? _smtpConfig.to
    : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = "[n8watch] Monitoring System Shutting Down";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:20px 28px">
            <span style="font-size:13px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase">n8watch</span>
          </td>
        </tr>
        <tr>
          <td style="background:#fff7ed;border-left:4px solid #f97316;border-right:1px solid #e5e7eb;padding:20px 28px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#c2410c">🛑 Monitoring System Shutting Down</p>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280">n8watch is shutting down and will no longer monitor your targets.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb;width:40%">Shutdown At</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${now}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Sent by <strong style="color:#6b7280">n8watch</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await _transporter.sendMail({
      from: _smtpConfig.from,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[Email] System shutdown notification sent`);
  } catch (err) {
    console.error("[Email] Failed to send system shutdown email:", err.message);
  }
}

async function sendReconnectEmail(disconnectedAt) {
  if (!_transporter || !_smtpConfig) return;

  const recipients = Array.isArray(_smtpConfig.to)
    ? _smtpConfig.to
    : [_smtpConfig.to];
  const now = formatDateTime(new Date());
  const subject = "[n8watch] Network Connectivity Restored";
  const downtime = disconnectedAt
    ? formatDuration(Date.now() - disconnectedAt)
    : "unknown";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr>
          <td style="background:#111827;border-radius:12px 12px 0 0;padding:20px 28px">
            <span style="font-size:13px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;text-transform:uppercase">n8watch</span>
          </td>
        </tr>
        <tr>
          <td style="background:#f0fdf4;border-left:4px solid #22c55e;border-right:1px solid #e5e7eb;padding:20px 28px">
            <p style="margin:0;font-size:22px;font-weight:700;color:#16a34a">🌐 Network Connectivity Restored</p>
            <p style="margin:6px 0 0;font-size:14px;color:#6b7280">n8watch has regained network connectivity — monitored targets are reachable again.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr style="background:#ffffff">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #e5e7eb;width:40%">Reconnected At</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb">${now}</td>
              </tr>
              <tr style="background:#f9fafb">
                <td style="padding:10px 16px;font-size:13px;color:#374151;font-weight:500">Disconnection Duration</td>
                <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:600">${downtime}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 28px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">Sent by <strong style="color:#6b7280">n8watch</strong></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await _transporter.sendMail({
      from: _smtpConfig.from,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`[Email] Reconnect notification sent`);
  } catch (err) {
    console.error("[Email] Failed to send reconnect email:", err.message);
  }
}

function isEnabled() {
  return _emailEnabled;
}

module.exports = {
  initEmail,
  sendAlertEmail,
  sendRecoveryEmail,
  sendSystemStartEmail,
  sendSystemShutdownEmail,
  sendReconnectEmail,
  isEnabled,
};
