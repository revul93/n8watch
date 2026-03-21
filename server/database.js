'use strict';

const path = require('path');
const Database = require('better-sqlite3');

let _db = null;

function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

function initDatabase() {
  const dbPath = path.join(__dirname, '..', 'data', 'n8netwatch.db');
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      ip          TEXT    NOT NULL UNIQUE,
      grp         TEXT,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS ping_results (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id         INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      is_alive          INTEGER NOT NULL,
      min_latency       REAL,
      avg_latency       REAL,
      max_latency       REAL,
      jitter            REAL,
      packet_loss       REAL NOT NULL DEFAULT 100,
      packets_sent      INTEGER NOT NULL DEFAULT 0,
      packets_received  INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_ping_results_target_created
      ON ping_results(target_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id    INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      rule_name    TEXT    NOT NULL,
      severity     TEXT    NOT NULL,
      condition    TEXT    NOT NULL,
      message      TEXT,
      resolved     INTEGER NOT NULL DEFAULT 0,
      resolved_at  INTEGER,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_target_created
      ON alerts(target_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_alerts_resolved
      ON alerts(resolved, created_at DESC);
  `);

  return _db;
}

function syncTargets(targets) {
  const db = getDb();
  const now = Date.now();

  const upsert = db.prepare(`
    INSERT INTO targets (name, ip, grp, created_at, updated_at)
    VALUES (@name, @ip, @grp, @now, @now)
    ON CONFLICT(ip) DO UPDATE SET
      name       = excluded.name,
      grp        = excluded.grp,
      updated_at = excluded.updated_at
  `);

  const syncAll = db.transaction((targets) => {
    for (const t of targets) {
      upsert.run({ name: t.name, ip: t.ip, grp: t.group || null, now });
    }
  });

  syncAll(targets);
}

function insertPingResult(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO ping_results
      (target_id, is_alive, min_latency, avg_latency, max_latency, jitter,
       packet_loss, packets_sent, packets_received, created_at)
    VALUES
      (@target_id, @is_alive, @min_latency, @avg_latency, @max_latency, @jitter,
       @packet_loss, @packets_sent, @packets_received, @created_at)
  `);
  const result = stmt.run({
    target_id:        data.target_id,
    is_alive:         data.is_alive ? 1 : 0,
    min_latency:      data.min_latency ?? null,
    avg_latency:      data.avg_latency ?? null,
    max_latency:      data.max_latency ?? null,
    jitter:           data.jitter ?? null,
    packet_loss:      data.packet_loss ?? 100,
    packets_sent:     data.packets_sent ?? 0,
    packets_received: data.packets_received ?? 0,
    created_at:       data.created_at ?? Date.now(),
  });
  return result.lastInsertRowid;
}

function getLatestPingResult(targetId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ping_results
    WHERE target_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(targetId) || null;
}

function getAllTargetsWithLatest() {
  const db = getDb();
  return db.prepare(`
    SELECT
      t.id, t.name, t.ip, t.grp AS "group", t.created_at, t.updated_at,
      pr.id           AS latest_ping_id,
      pr.is_alive,
      pr.min_latency,
      pr.avg_latency,
      pr.max_latency,
      pr.jitter,
      pr.packet_loss,
      pr.packets_sent,
      pr.packets_received,
      pr.created_at   AS last_checked_at
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    ORDER BY t.name ASC
  `).all();
}

function getTargetById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT
      t.id, t.name, t.ip, t.grp AS "group", t.created_at, t.updated_at,
      pr.id           AS latest_ping_id,
      pr.is_alive,
      pr.min_latency,
      pr.avg_latency,
      pr.max_latency,
      pr.jitter,
      pr.packet_loss,
      pr.packets_sent,
      pr.packets_received,
      pr.created_at   AS last_checked_at
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE t.id = ?
  `).get(id) || null;
}

function getPingResults(targetId, from, to, limit = 100, offset = 0) {
  const db = getDb();
  const fromMs = from ? Number(from) : 0;
  const toMs   = to   ? Number(to)   : Date.now();
  const lim    = Math.min(Number(limit) || 100, 1000);
  const off    = Number(offset) || 0;

  const rows = db.prepare(`
    SELECT * FROM ping_results
    WHERE target_id = ?
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(targetId, fromMs, toMs, lim, off);

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt FROM ping_results
    WHERE target_id = ?
      AND created_at >= ?
      AND created_at <= ?
  `).get(targetId, fromMs, toMs).cnt;

  return { rows, total, limit: lim, offset: off };
}

function getMetrics(targetId, from, to, intervalSeconds = 300) {
  const db = getDb();
  const fromMs = from ? Number(from) : Date.now() - 86400000;
  const toMs   = to   ? Number(to)   : Date.now();
  const bucketMs = intervalSeconds * 1000;

  return db.prepare(`
    SELECT
      (created_at / @bucket) * @bucket AS bucket_ts,
      AVG(avg_latency)       AS avg_latency,
      MIN(min_latency)       AS min_latency,
      MAX(max_latency)       AS max_latency,
      AVG(jitter)            AS jitter,
      AVG(packet_loss)       AS packet_loss,
      SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS uptime_pct,
      COUNT(*)               AS sample_count
    FROM ping_results
    WHERE target_id = @target_id
      AND created_at >= @from
      AND created_at <= @to
    GROUP BY bucket_ts
    ORDER BY bucket_ts ASC
  `).all({ bucket: bucketMs, target_id: targetId, from: fromMs, to: toMs });
}

function getUptime(targetId) {
  const db = getDb();
  const now = Date.now();

  const query = db.prepare(`
    SELECT
      SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS uptime_pct,
      COUNT(*) AS total
    FROM ping_results
    WHERE target_id = ? AND created_at >= ?
  `);

  const calc = (windowMs) => {
    const row = query.get(targetId, now - windowMs);
    if (!row || row.total === 0) return null;
    return Math.round(row.uptime_pct * 100) / 100;
  };

  return {
    uptime_1h:  calc(3600000),
    uptime_24h: calc(86400000),
    uptime_7d:  calc(604800000),
    uptime_30d: calc(2592000000),
  };
}

function getDashboardSummary() {
  const db = getDb();

  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN pr.is_alive = 1 THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN pr.is_alive = 0 THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN pr.id IS NULL THEN 1 ELSE 0 END)   AS unknown
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
  `).get();

  const latency = db.prepare(`
    SELECT
      AVG(pr.avg_latency)  AS avg_latency,
      AVG(pr.packet_loss)  AS avg_packet_loss
    FROM targets t
    JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE pr.is_alive = 1
  `).get();

  const activeAlerts = db.prepare(`
    SELECT COUNT(*) AS cnt FROM alerts WHERE resolved = 0
  `).get();

  return {
    total:           counts.total || 0,
    up:              counts.up    || 0,
    down:            counts.down  || 0,
    unknown:         counts.unknown || 0,
    avg_latency:     latency ? (latency.avg_latency   || null) : null,
    avg_packet_loss: latency ? (latency.avg_packet_loss || null) : null,
    active_alerts:   activeAlerts.cnt || 0,
  };
}

function insertAlert(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO alerts (target_id, rule_name, severity, condition, message, created_at)
    VALUES (@target_id, @rule_name, @severity, @condition, @message, @created_at)
  `);
  const result = stmt.run({
    target_id:  data.target_id,
    rule_name:  data.rule_name,
    severity:   data.severity,
    condition:  data.condition,
    message:    data.message || null,
    created_at: data.created_at || Date.now(),
  });
  return result.lastInsertRowid;
}

function getAlerts(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (filters.severity) {
    conditions.push('a.severity = @severity');
    params.severity = filters.severity;
  }
  if (filters.target_id) {
    conditions.push('a.target_id = @target_id');
    params.target_id = Number(filters.target_id);
  }
  if (filters.resolved !== undefined && filters.resolved !== '') {
    conditions.push('a.resolved = @resolved');
    params.resolved = filters.resolved === 'true' || filters.resolved === '1' ? 1 : 0;
  }
  if (filters.from) {
    conditions.push('a.created_at >= @from');
    params.from = Number(filters.from);
  }
  if (filters.to) {
    conditions.push('a.created_at <= @to');
    params.to = Number(filters.to);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit  = Math.min(Number(filters.limit)  || 50, 500);
  const offset = Number(filters.offset) || 0;

  const rows = db.prepare(`
    SELECT a.*, t.name AS target_name, t.ip AS target_ip
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  const total = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    ${where}
  `).get(params).cnt;

  return { rows, total, limit, offset };
}

function getActiveAlerts() {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, t.name AS target_name, t.ip AS target_ip
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    WHERE a.resolved = 0
    ORDER BY a.created_at DESC
  `).all();
}

function resolveAlert(alertId, resolvedAt) {
  const db = getDb();
  db.prepare(`
    UPDATE alerts SET resolved = 1, resolved_at = ? WHERE id = ?
  `).run(resolvedAt || Date.now(), alertId);
}

function deleteOldData(retentionDays) {
  const db = getDb();
  const cutoff = Date.now() - retentionDays * 86400000;

  const delPings = db.prepare('DELETE FROM ping_results WHERE created_at < ?').run(cutoff);
  const delAlerts = db.prepare('DELETE FROM alerts WHERE created_at < ? AND resolved = 1').run(cutoff);

  return { deletedPings: delPings.changes, deletedAlerts: delAlerts.changes };
}

function getLatestPingResultForAll() {
  const db = getDb();
  return db.prepare(`
    SELECT pr.*
    FROM ping_results pr
    INNER JOIN (
      SELECT target_id, MAX(created_at) AS max_ts
      FROM ping_results
      GROUP BY target_id
    ) latest ON pr.target_id = latest.target_id AND pr.created_at = latest.max_ts
  `).all();
}

module.exports = {
  getDb,
  initDatabase,
  syncTargets,
  insertPingResult,
  getLatestPingResult,
  getAllTargetsWithLatest,
  getTargetById,
  getPingResults,
  getMetrics,
  getUptime,
  getDashboardSummary,
  insertAlert,
  getAlerts,
  getActiveAlerts,
  resolveAlert,
  deleteOldData,
  getLatestPingResultForAll,
};
