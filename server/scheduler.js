'use strict';

const cron = require('node-cron');
const { pingAllTargets } = require('./ping-engine');
const { broadcast }      = require('./websocket');

let _activeTasks = [];

// Connectivity state: track whether all non-user targets were unreachable
let _disconnected     = false;
let _disconnectedAt   = null;
let _emailSvcRef      = null;

/**
 * initScheduler - registers cron jobs for ping cycles and data retention cleanup.
 *
 * @param {object} config
 * @param {object} db         - database module
 * @param {object} wss        - WebSocket server (unused directly, broadcast is used)
 * @param {object} alertEngine
 * @param {object} [emailSvc] - optional email service for connectivity notifications
 */
function initScheduler(config, db, wss, alertEngine, emailSvc) {
  const interval       = config.general.ping_interval || 30;
  const retentionDays  = config.general.data_retention_days || 90;

  if (emailSvc) _emailSvcRef = emailSvc;

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
      // Archive any user targets whose lifetime has just ended, then notify
      // clients so the dashboard removes them without a page reload.
      try {
        const archived = db.archiveExpiredUserTargets();
        if (archived > 0) {
          console.log(`[Scheduler] Archived ${archived} expired user target(s)`);
          broadcast('targets_changed', { action: 'expired', count: archived });
        }
      } catch (archiveErr) {
        console.error('[Scheduler] Failed to archive expired user targets:', archiveErr.message);
      }

      const targets = db.getAllTargetsWithLatest();
      if (targets.length === 0) return;

      const results = await pingAllTargets(targets, config.general);

      // Detect connectivity changes: check if all non-user targets are down
      const nonUserResults = results.filter(r => !r.target.is_user_target);
      const anyAlive = nonUserResults.some(r => r.metrics.is_alive);

      if (nonUserResults.length > 0) {
        if (!anyAlive && !_disconnected) {
          // Transition: connected → disconnected
          _disconnected   = true;
          _disconnectedAt = Date.now();
          console.log('[Scheduler] All targets unreachable — marking as disconnected');
        } else if (anyAlive && _disconnected) {
          // Transition: disconnected → reconnected
          _disconnected = false;
          console.log('[Scheduler] Network connectivity restored — sending reconnect email');
          if (_emailSvcRef) {
            _emailSvcRef.sendReconnectEmail(_disconnectedAt).catch((err) =>
              console.error('[Scheduler] Reconnect email error:', err.message)
            );
          }
          _disconnectedAt = null;
        }
      } else {
        // No non-user targets exist; connectivity tracking is not active
      }

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
