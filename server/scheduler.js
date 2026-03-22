'use strict';

const cron = require('node-cron');
const { pingAllTargets } = require('./ping-engine');
const { broadcast }      = require('./websocket');

let _activeTasks = [];

/**
 * initScheduler - registers cron jobs for ping cycles and data retention cleanup.
 *
 * @param {object} config
 * @param {object} db         - database module
 * @param {object} wss        - WebSocket server (unused directly, broadcast is used)
 * @param {object} alertEngine
 */
function initScheduler(config, db, wss, alertEngine) {
  const interval       = config.general.ping_interval || 30;
  const retentionDays  = config.general.data_retention_days || 90;

  // ── Ping cycle ───────────────────────────────────────────────────────────────
  // node-cron seconds field only supports 1–59; warn if the configured interval
  // exceeds that range, as the effective rate will differ from the configured one.
  const cronInterval = Math.min(Math.max(Math.floor(interval), 1), 59);
  if (interval > 59) {
    console.warn(
      `[Scheduler] ping_interval (${interval}s) exceeds the 59s maximum for ` +
      'the cron seconds field. Clamped to 59s. Use a value ≤59 for precise control.'
    );
  }
  const pingPattern  = `*/${cronInterval} * * * * *`;

  console.log(`[Scheduler] Ping job: every ${cronInterval}s (pattern: ${pingPattern})`);

  const pingTask = cron.schedule(pingPattern, async () => {
    try {
      const targets = db.getAllTargetsWithLatest();
      if (targets.length === 0) return;

      const results = await pingAllTargets(targets, config.general);

      for (const { target, metrics } of results) {
        const rowId = db.insertPingResult({
          target_id:        target.id,
          is_alive:         metrics.is_alive,
          min_latency:      metrics.min_latency,
          avg_latency:      metrics.avg_latency,
          max_latency:      metrics.max_latency,
          jitter:           metrics.jitter,
          packet_loss:      metrics.packet_loss,
          packets_sent:     metrics.packets_sent,
          packets_received: metrics.packets_received,
          created_at:       Date.now(),
        });

        const pingResult = { id: rowId, ...metrics };

        // Broadcast live update to WebSocket clients
        broadcast('ping_result', {
          target_id:   target.id,
          target_name: target.name,
          target_ip:   target.ip,
          ...pingResult,
        });

        // Check for alert conditions and recovery
        await alertEngine.processAlerts(target, pingResult);
        await alertEngine.checkRecovery(target, pingResult);
      }
    } catch (err) {
      console.error('[Scheduler] Ping cycle error:', err.message);
    }
  });

  _activeTasks.push(pingTask);

  // ── Data retention cleanup — daily at 02:00 ──────────────────────────────────
  const cleanupTask = cron.schedule('0 2 * * *', () => {
    try {
      const result = db.deleteOldData(retentionDays);
      console.log(`[Scheduler] Cleanup: removed ${result.deletedPings} ping rows, ${result.deletedAlerts} alert rows`);
    } catch (err) {
      console.error('[Scheduler] Cleanup error:', err.message);
    }
  });

  _activeTasks.push(cleanupTask);

  console.log('[Scheduler] All jobs registered');
}

function stopAll() {
  for (const task of _activeTasks) task.stop();
  _activeTasks = [];
}

module.exports = { initScheduler, stopAll };
