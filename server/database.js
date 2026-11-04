"use strict";

const path = require("path");
const Database = require("better-sqlite3");

let _db = null;

function getDb() {
  if (!_db)
    throw new Error("Database not initialized. Call initDatabase() first.");
  return _db;
}

function initDatabase() {
  // If n8watch_DATA_DIR is set, use it as the directory for the SQLite database.
  const dataDir = process.env.n8watch_DATA_DIR
    ? require("path").resolve(process.env.n8watch_DATA_DIR)
    : path.join(__dirname, "..", "data");

  require("fs").mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "n8watch.db");
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      ip              TEXT    NOT NULL,
      grp             TEXT,
      interface       TEXT,
      interface_alias TEXT,
      is_user_target  INTEGER NOT NULL DEFAULT 0,
      expires_at      INTEGER,
      archived_at     INTEGER,
      up_count        INTEGER NOT NULL DEFAULT 0,
      total_count     INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    -- Unique constraint: same IP is only a duplicate when the interface is also
    -- the same (or both are absent). This allows monitoring the same host via
    -- multiple outgoing interfaces (e.g. eth0 and eth1) simultaneously.
    -- Two partial indexes implement NULL-safe equality for the interface column:
    --   1. Among targets with no interface: at most one entry per IP.
    --   2. Among targets with an interface: at most one entry per (IP, interface).
    -- Only ACTIVE targets reserve an IP (archived_at IS NULL): an expired user
    -- target is retained for reporting but must not block re-adding the same IP.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_ip_null_iface
      ON targets(ip) WHERE interface IS NULL AND archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_ip_iface
      ON targets(ip, interface) WHERE interface IS NOT NULL AND archived_at IS NULL;

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

    -- Archive table for user-defined targets whose lifetime has ended.
    -- Records are never deleted so the full history is preserved.
    CREATE TABLE IF NOT EXISTS expired_targets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      ip              TEXT    NOT NULL,
      interface       TEXT,
      interface_alias TEXT,
      target_created_at INTEGER NOT NULL,
      expired_at      INTEGER NOT NULL,
      archived_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      ping_count      INTEGER NOT NULL DEFAULT 0,
      uptime_overall  REAL
    );

    CREATE INDEX IF NOT EXISTS idx_expired_targets_expired_at
      ON expired_targets(expired_at DESC);

    -- Speedtest results: periodic internet speed measurements
    CREATE TABLE IF NOT EXISTS speedtest_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      download    REAL,       -- Mbps
      upload      REAL,       -- Mbps
      tool        TEXT,       -- "speedtest", "fast", or "both"
      interface   TEXT,
      error       TEXT,       -- non-null when the test failed
      created_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_speedtest_created
      ON speedtest_results(created_at DESC);

    -- User-defined temporary groups: arbitrary named sets of targets (system or
    -- user) used for organization and the comparison page. Independent of the
    -- per-target grp label that drives the dashboard group panels.
    CREATE TABLE IF NOT EXISTS temp_groups (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      color      TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    -- Many-to-many membership: a target can belong to any number of temp groups.
    CREATE TABLE IF NOT EXISTS temp_group_members (
      group_id   INTEGER NOT NULL REFERENCES temp_groups(id) ON DELETE CASCADE,
      target_id  INTEGER NOT NULL REFERENCES targets(id)     ON DELETE CASCADE,
      added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      PRIMARY KEY (group_id, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_temp_group_members_target
      ON temp_group_members(target_id);
  `);

  // Migrate existing databases: add columns if they don't exist yet
  const targetCols = _db
    .prepare("PRAGMA table_info(targets)")
    .all()
    .map((c) => c.name);
  if (!targetCols.includes("is_user_target")) {
    _db.exec(
      "ALTER TABLE targets ADD COLUMN is_user_target INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!targetCols.includes("expires_at")) {
    _db.exec("ALTER TABLE targets ADD COLUMN expires_at INTEGER");
  }
  if (!targetCols.includes("archived_at")) {
    _db.exec("ALTER TABLE targets ADD COLUMN archived_at INTEGER");
  }
  // Running uptime counters so per-host lifetime uptime is O(1) instead of a
  // full ping_results scan per target on every dashboard load. Backfill once
  // from existing data when the columns are first added.
  if (!targetCols.includes("up_count")) {
    _db.exec("ALTER TABLE targets ADD COLUMN up_count INTEGER NOT NULL DEFAULT 0");
    _db.exec("ALTER TABLE targets ADD COLUMN total_count INTEGER NOT NULL DEFAULT 0");
    const agg = _db
      .prepare(
        "SELECT target_id, COUNT(*) AS tc, SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) AS uc FROM ping_results GROUP BY target_id",
      )
      .all();
    const upd = _db.prepare("UPDATE targets SET total_count = ?, up_count = ? WHERE id = ?");
    const backfill = _db.transaction((rows) => {
      for (const r of rows) upd.run(r.tc, r.uc || 0, r.target_id);
    });
    backfill(agg);
    console.log(`[DB] Backfilled uptime counters for ${agg.length} target(s)`);
  }
  if (!targetCols.includes("interface")) {
    _db.exec("ALTER TABLE targets ADD COLUMN interface TEXT");
  }
  if (!targetCols.includes("interface_alias")) {
    _db.exec("ALTER TABLE targets ADD COLUMN interface_alias TEXT");
  }

  // Migrate the IP uniqueness indexes to ignore archived (expired) targets, so a
  // retained expired user target no longer blocks re-adding the same IP.
  // CREATE INDEX IF NOT EXISTS won't replace an existing index, so drop & recreate
  // any that predate the `archived_at IS NULL` predicate.
  const ipIdx = _db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND name IN ('uq_targets_ip_null_iface','uq_targets_ip_iface')",
    )
    .all();
  const needsIdxMigration = ipIdx.some((i) => i.sql && !/archived_at/i.test(i.sql));
  if (needsIdxMigration) {
    _db.exec(`
      DROP INDEX IF EXISTS uq_targets_ip_null_iface;
      DROP INDEX IF EXISTS uq_targets_ip_iface;
      CREATE UNIQUE INDEX uq_targets_ip_null_iface
        ON targets(ip) WHERE interface IS NULL AND archived_at IS NULL;
      CREATE UNIQUE INDEX uq_targets_ip_iface
        ON targets(ip, interface) WHERE interface IS NOT NULL AND archived_at IS NULL;
    `);
    console.log("[DB] Migrated IP uniqueness indexes to exclude archived targets");
  }

  // Migrate: if the targets table still has a UNIQUE constraint on the ip column
  // alone (the old schema), recreate the table without it and add the new
  // partial unique indexes that allow the same IP with different interfaces.
  const tableSchema = _db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='targets'",
    )
    .get();
  const hasLegacyUniqueIp =
    tableSchema &&
    /ip\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableSchema.sql);
  if (hasLegacyUniqueIp) {
    _db.exec(`
      PRAGMA foreign_keys = OFF;

      CREATE TABLE targets_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        ip              TEXT    NOT NULL,
        grp             TEXT,
        interface       TEXT,
        interface_alias TEXT,
        is_user_target  INTEGER NOT NULL DEFAULT 0,
        expires_at      INTEGER,
        archived_at     INTEGER,
        up_count        INTEGER NOT NULL DEFAULT 0,
        total_count     INTEGER NOT NULL DEFAULT 0,
        created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );

      INSERT INTO targets_new
        SELECT id, name, ip, grp, interface, interface_alias,
               is_user_target, expires_at, archived_at, up_count, total_count, created_at, updated_at
        FROM targets;

      DROP TABLE targets;
      ALTER TABLE targets_new RENAME TO targets;

      PRAGMA foreign_keys = ON;
    `);

    // Re-create the partial unique indexes after the migration
    _db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_ip_null_iface
        ON targets(ip) WHERE interface IS NULL AND archived_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_targets_ip_iface
        ON targets(ip, interface) WHERE interface IS NOT NULL AND archived_at IS NULL;
    `);

    console.log("[DB] Migrated targets table: replaced UNIQUE(ip) with partial unique indexes");
  }

  return _db;
}

function syncTargets(targets) {
  const db = getDb();
  const now = Date.now();

  const updateStmt = db.prepare(`
    UPDATE targets
    SET
      name            = @name,
      grp             = @grp,
      interface_alias = @interface_alias,
      is_user_target  = 0,
      expires_at      = NULL,
      updated_at      = @now
    WHERE ip = @ip
      AND COALESCE(interface, '') = COALESCE(@interface, '')
      AND is_user_target = 0
  `);

  const insertStmt = db.prepare(`
    INSERT INTO targets (name, ip, grp, interface, interface_alias, is_user_target, created_at, updated_at)
    VALUES (@name, @ip, @grp, @interface, @interface_alias, 0, @now, @now)
  `);

  const syncAll = db.transaction((targets) => {
    // Build a set of canonical keys (ip + '|' + interface) for the current config.
    // This is used to remove config targets that are no longer present.
    const configKeys = new Set(
      targets.map((t) => `${t.ip}|${t.interface || ""}`)
    );

    for (const t of targets) {
      const params = {
        name: t.name,
        ip: t.ip,
        grp: t.group || null,
        interface: t.interface || null,
        interface_alias: t.interface_alias || null,
        now,
      };
      const result = updateStmt.run(params);
      if (result.changes === 0) {
        insertStmt.run(params);
      }
    }

    // Remove config targets whose (ip, interface) pair is no longer in config,
    // while preserving user-added targets.
    const dbConfigTargets = db
      .prepare("SELECT id, ip, interface FROM targets WHERE is_user_target = 0")
      .all();
    for (const row of dbConfigTargets) {
      const key = `${row.ip}|${row.interface || ""}`;
      if (!configKeys.has(key)) {
        db.prepare("DELETE FROM targets WHERE id = ?").run(row.id);
      }
    }
  });

  syncAll(targets);
}

const _insertPingStmt = () => getDb().prepare(`
    INSERT INTO ping_results
      (target_id, is_alive, min_latency, avg_latency, max_latency, jitter,
       packet_loss, packets_sent, packets_received, created_at)
    VALUES
      (@target_id, @is_alive, @min_latency, @avg_latency, @max_latency, @jitter,
       @packet_loss, @packets_sent, @packets_received, @created_at)
  `);
const _bumpCountersStmt = () => getDb().prepare(
  "UPDATE targets SET total_count = total_count + 1, up_count = up_count + @alive WHERE id = @id",
);

function insertPingResult(data) {
  const db = getDb();
  const insert = _insertPingStmt();
  const bump = _bumpCountersStmt();
  const alive = data.is_alive ? 1 : 0;
  // Insert the sample and update the target's running uptime counters atomically
  // (the counters back the O(1) lifetime-uptime figure on the dashboard).
  const tx = db.transaction((d) => {
    const result = insert.run({
      target_id: d.target_id,
      is_alive: alive,
      min_latency: d.min_latency ?? null,
      avg_latency: d.avg_latency ?? null,
      max_latency: d.max_latency ?? null,
      jitter: d.jitter ?? null,
      packet_loss: d.packet_loss ?? 100,
      packets_sent: d.packets_sent ?? 0,
      packets_received: d.packets_received ?? 0,
      created_at: d.created_at ?? Date.now(),
    });
    bump.run({ id: d.target_id, alive });
    return result.lastInsertRowid;
  });
  return tx(data);
}

function getLatestPingResult(targetId) {
  const db = getDb();
  return (
    db
      .prepare(
        `
    SELECT * FROM ping_results
    WHERE target_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `,
      )
      .get(targetId) || null
  );
}

// Minimal active-target list for the ping scheduler: just the fields needed to
// probe and attribute results. Avoids the latest-ping join and uptime math that
// make getAllTargetsWithLatest expensive — this runs every ping cycle.
function getActiveTargetsForPing() {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, ip, interface, interface_alias, is_user_target, expires_at
         FROM targets
        WHERE (is_user_target = 0)
           OR (is_user_target = 1 AND (expires_at IS NULL OR expires_at > ?))`,
    )
    .all(Date.now());
}

function getAllTargetsWithLatest() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT
      t.id, t.name, t.ip, t.grp AS "group",
      t.interface, t.interface_alias,
      t.is_user_target, t.expires_at,
      t.created_at, t.updated_at,
      pr.id           AS latest_ping_id,
      pr.is_alive,
      pr.min_latency,
      pr.avg_latency,
      pr.max_latency,
      pr.jitter,
      pr.packet_loss,
      pr.packets_sent,
      pr.packets_received,
      pr.created_at   AS last_checked_at,
      CASE WHEN t.total_count > 0 THEN t.up_count * 100.0 / t.total_count ELSE NULL END AS uptime_overall
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE (t.is_user_target = 0) OR (t.is_user_target = 1 AND (t.expires_at IS NULL OR t.expires_at > ?))
    ORDER BY t.is_user_target ASC,
             CASE WHEN t.is_user_target = 0 THEN t.id END ASC,
             t.created_at DESC
  `,
    )
    .all(Date.now());
}

function getTargetById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `
    SELECT
      t.id, t.name, t.ip, t.grp AS "group",
      t.interface, t.interface_alias,
      t.created_at, t.updated_at,
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
  `,
      )
      .get(id) || null
  );
}

function parseMs(val, defaultVal) {
  if (val === undefined || val === null) return defaultVal;
  const n = Number(val);
  if (!isNaN(n)) return n;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  return defaultVal;
}

function getPingResults(targetId, from, to, limit = 100, offset = 0) {
  const db = getDb();
  const fromMs = parseMs(from, 0);
  const toMs = parseMs(to, Date.now());
  // Ceiling is generous so full-range exports/reports (which pass a large limit)
  // are honored; ordinary paginated callers still pass small limits.
  const lim = Math.min(Number(limit) || 100, 500000);
  const off = Number(offset) || 0;

  const rows = db
    .prepare(
      `
    SELECT * FROM ping_results
    WHERE target_id = ?
      AND created_at >= ?
      AND created_at <= ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(targetId, fromMs, toMs, lim, off);

  const total = db
    .prepare(
      `
    SELECT COUNT(*) AS cnt FROM ping_results
    WHERE target_id = ?
      AND created_at >= ?
      AND created_at <= ?
  `,
    )
    .get(targetId, fromMs, toMs).cnt;

  return { rows, total, limit: lim, offset: off };
}

function getMetrics(targetId, from, to, intervalSeconds = 300) {
  const db = getDb();
  const fromMs = parseMs(from, Date.now() - 86400000);
  const toMs = parseMs(to, Date.now());
  const bucketMs = intervalSeconds * 1000;

  return db
    .prepare(
      `
    SELECT
      (created_at / @bucket) * @bucket AS bucket,
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
    GROUP BY bucket
    ORDER BY bucket ASC
  `,
    )
    .all({ bucket: bucketMs, target_id: targetId, from: fromMs, to: toMs });
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

  const queryAll = db.prepare(`
    SELECT
      SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS uptime_pct,
      COUNT(*) AS total
    FROM ping_results
    WHERE target_id = ?
  `);

  const calc = (windowMs) => {
    const row = query.get(targetId, now - windowMs);
    if (!row || row.total === 0) return null;
    return Math.round(row.uptime_pct * 100) / 100;
  };

  const rowAll = queryAll.get(targetId);
  const uptime_overall =
    !rowAll || rowAll.total === 0
      ? null
      : Math.round(rowAll.uptime_pct * 100) / 100;

  return {
    uptime_1h: calc(3600000),
    uptime_24h: calc(86400000),
    uptime_7d: calc(604800000),
    uptime_30d: calc(2592000000),
    uptime_overall,
  };
}

function getDashboardSummary() {
  const db = getDb();
  const now = Date.now();

  // Exclude expired user targets (retained for reporting) from active counts.
  const NOT_EXPIRED = '(t.is_user_target = 0 OR t.expires_at IS NULL OR t.expires_at > ?)';

  const counts = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN pr.is_alive = 1 THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN pr.is_alive = 0 THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN pr.id IS NULL THEN 1 ELSE 0 END)   AS unknown
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE ${NOT_EXPIRED}
  `,
    )
    .get(now);

  const latency = db
    .prepare(
      `
    SELECT
      AVG(pr.avg_latency)  AS avg_latency,
      AVG(pr.packet_loss)  AS avg_packet_loss
    FROM targets t
    JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE pr.is_alive = 1 AND ${NOT_EXPIRED}
  `,
    )
    .get(now);

  const activeAlerts = db
    .prepare(
      `
    SELECT COUNT(*) AS cnt FROM alerts WHERE resolved = 0
  `,
    )
    .get();

  return {
    total: counts.total || 0,
    up: counts.up || 0,
    down: counts.down || 0,
    unknown: counts.unknown || 0,
    avg_latency: latency ? latency.avg_latency || null : null,
    avg_packet_loss: latency ? latency.avg_packet_loss || null : null,
    active_alerts: activeAlerts.cnt || 0,
  };
}

function insertAlert(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO alerts (target_id, rule_name, severity, condition, message, created_at)
    VALUES (@target_id, @rule_name, @severity, @condition, @message, @created_at)
  `);
  const result = stmt.run({
    target_id: data.target_id,
    rule_name: data.rule_name,
    severity: data.severity,
    condition: data.condition,
    message: data.message || null,
    created_at: data.created_at || Date.now(),
  });
  return result.lastInsertRowid;
}

function getAlerts(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (filters.severity) {
    conditions.push("a.severity = @severity");
    params.severity = filters.severity;
  }
  if (filters.target_id) {
    conditions.push("a.target_id = @target_id");
    params.target_id = Number(filters.target_id);
  }
  if (filters.resolved !== undefined && filters.resolved !== "") {
    conditions.push("a.resolved = @resolved");
    params.resolved =
      filters.resolved === "true" || filters.resolved === "1" ? 1 : 0;
  }
  if (filters.from) {
    conditions.push("a.created_at >= @from");
    params.from = parseMs(filters.from, 0);
  }
  if (filters.to) {
    conditions.push("a.created_at <= @to");
    params.to = parseMs(filters.to, Date.now());
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const limit = Math.min(Number(filters.limit) || 50, 500);
  const offset = Number(filters.offset) || 0;

  const rows = db
    .prepare(
      `
    SELECT a.*, t.name AS target_name, t.ip AS target_ip
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT @limit OFFSET @offset
  `,
    )
    .all({ ...params, limit, offset });

  const total = db
    .prepare(
      `
    SELECT COUNT(*) AS cnt
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    ${where}
  `,
    )
    .get(params).cnt;

  return { rows, total, limit, offset };
}

function getActiveAlerts() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT a.*, t.name AS target_name, t.ip AS target_ip
    FROM alerts a
    JOIN targets t ON t.id = a.target_id
    WHERE a.resolved = 0
    ORDER BY a.created_at DESC
  `,
    )
    .all();
}

function resolveAlert(alertId, resolvedAt) {
  const db = getDb();
  db.prepare(
    `
    UPDATE alerts SET resolved = 1, resolved_at = ? WHERE id = ?
  `,
  ).run(resolvedAt || Date.now(), alertId);
}

function addUserTarget(name, ip, iface, ifaceAlias, lifetimeDays) {
  const db = getDb();
  const now = Date.now();
  const maxDays = require('./config').getConfig().general.max_user_target_lifetime_days;
  const days = (typeof lifetimeDays === 'number' && lifetimeDays > 0) ? lifetimeDays : maxDays;
  const expiresAt = now + days * 86400000;

  // Enforce (ip, interface) uniqueness at the application level, but only among
  // ACTIVE targets — a retained expired target (archived_at set) must not block
  // re-adding the same IP.
  // Two NULLs are considered equal here (same host, same default interface).
  const existing = db
    .prepare(
      "SELECT id FROM targets WHERE ip = ? AND COALESCE(interface, '') = COALESCE(?, '') AND archived_at IS NULL",
    )
    .get(ip, iface || null);
  if (existing) {
    const err = new Error(
      "UNIQUE constraint failed: a target with this IP and interface already exists",
    );
    err.code = "UNIQUE_IP_INTERFACE";
    throw err;
  }

  const result = db
    .prepare(
      `
    INSERT INTO targets (name, ip, grp, interface, interface_alias, is_user_target, expires_at, created_at, updated_at)
    VALUES (@name, @ip, NULL, @interface, @interface_alias, 1, @expires_at, @now, @now)
  `,
    )
    .run({
      name,
      ip,
      interface: iface || null,
      interface_alias: ifaceAlias || null,
      expires_at: expiresAt,
      now,
    });
  return result.lastInsertRowid;
}

function deleteUserTarget(id) {
  const db = getDb();
  const info = db
    .prepare("DELETE FROM targets WHERE id = ? AND is_user_target = 1")
    .run(id);
  return info.changes > 0;
}

// Edit an ACTIVE temporary target. Accepts any subset of
// { name, ip, interface, interface_alias, lifetime_days }. Returns the updated
// row, or throws { code } on validation/uniqueness errors, or null if no such
// editable target exists.
function updateUserTarget(id, fields = {}) {
  const db = getDb();
  const now = Date.now();
  const target = db
    .prepare("SELECT * FROM targets WHERE id = ? AND is_user_target = 1 AND archived_at IS NULL")
    .get(id);
  if (!target) return null;

  const next = {
    name: target.name,
    ip: target.ip,
    interface: target.interface,
    interface_alias: target.interface_alias,
    expires_at: target.expires_at,
  };
  if (fields.name !== undefined) next.name = String(fields.name).trim();
  if (fields.ip !== undefined) next.ip = String(fields.ip).trim();
  if (fields.interface !== undefined) next.interface = fields.interface ? String(fields.interface).trim() : null;
  if (fields.interface_alias !== undefined) next.interface_alias = fields.interface_alias ? String(fields.interface_alias).trim() : null;
  if (fields.lifetime_days !== undefined && fields.lifetime_days !== null && fields.lifetime_days !== '') {
    const days = Number(fields.lifetime_days);
    if (Number.isFinite(days) && days > 0) next.expires_at = (target.created_at || now) + days * 86400000;
  }

  if (!next.name) { const e = new Error('Name is required'); e.code = 'VALIDATION'; throw e; }
  if (!next.ip) { const e = new Error('IP is required'); e.code = 'VALIDATION'; throw e; }

  // Uniqueness among ACTIVE targets (ignore archived + self).
  const clash = db
    .prepare(
      "SELECT id FROM targets WHERE ip = ? AND COALESCE(interface,'') = COALESCE(?,'') AND archived_at IS NULL AND id <> ?",
    )
    .get(next.ip, next.interface || null, id);
  if (clash) {
    const e = new Error('A target with this IP and interface already exists');
    e.code = 'UNIQUE_IP_INTERFACE';
    throw e;
  }

  db.prepare(
    `UPDATE targets
       SET name = @name, ip = @ip, interface = @interface,
           interface_alias = @interface_alias, expires_at = @expires_at,
           updated_at = @updated_at
     WHERE id = @id`,
  ).run({ ...next, updated_at: now, id });

  return db.prepare('SELECT * FROM targets WHERE id = ?').get(id);
}

// ── Temporary groups (flexible many-to-many) ────────────────────────────────────
function listTempGroups() {
  const db = getDb();
  const groups = db.prepare('SELECT id, name, color, created_at FROM temp_groups ORDER BY name COLLATE NOCASE ASC').all();
  const members = db.prepare('SELECT group_id, target_id FROM temp_group_members').all();
  const byGroup = new Map();
  for (const m of members) {
    if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, []);
    byGroup.get(m.group_id).push(m.target_id);
  }
  return groups.map((g) => ({ ...g, target_ids: byGroup.get(g.id) || [] }));
}

function createTempGroup(name, color = null) {
  const db = getDb();
  const trimmed = String(name || '').trim();
  if (!trimmed) { const e = new Error('Group name is required'); e.code = 'VALIDATION'; throw e; }
  const info = db
    .prepare('INSERT INTO temp_groups (name, color, created_at) VALUES (?, ?, ?)')
    .run(trimmed, color || null, Date.now());
  return db.prepare('SELECT id, name, color, created_at FROM temp_groups WHERE id = ?').get(info.lastInsertRowid);
}

function updateTempGroup(id, fields = {}) {
  const db = getDb();
  const g = db.prepare('SELECT * FROM temp_groups WHERE id = ?').get(id);
  if (!g) return null;
  const name = fields.name !== undefined ? String(fields.name).trim() : g.name;
  const color = fields.color !== undefined ? (fields.color || null) : g.color;
  if (!name) { const e = new Error('Group name is required'); e.code = 'VALIDATION'; throw e; }
  db.prepare('UPDATE temp_groups SET name = ?, color = ? WHERE id = ?').run(name, color, id);
  return db.prepare('SELECT id, name, color, created_at FROM temp_groups WHERE id = ?').get(id);
}

function deleteTempGroup(id) {
  const db = getDb();
  return db.prepare('DELETE FROM temp_groups WHERE id = ?').run(id).changes > 0;
}

// Replace a group's full membership with the given target ids.
function setTempGroupMembers(groupId, targetIds = []) {
  const db = getDb();
  const g = db.prepare('SELECT id FROM temp_groups WHERE id = ?').get(groupId);
  if (!g) return null;
  const valid = db.prepare('SELECT id FROM targets');
  const existing = new Set(valid.all().map((r) => r.id));
  const ids = [...new Set(targetIds.map(Number).filter((n) => existing.has(n)))];
  const del = db.prepare('DELETE FROM temp_group_members WHERE group_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO temp_group_members (group_id, target_id, added_at) VALUES (?, ?, ?)');
  const tx = db.transaction(() => {
    del.run(groupId);
    for (const tid of ids) ins.run(groupId, tid, Date.now());
  });
  tx();
  return ids;
}

function addTempGroupMember(groupId, targetId) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO temp_group_members (group_id, target_id, added_at) VALUES (?, ?, ?)').run(groupId, targetId, Date.now());
}

function removeTempGroupMember(groupId, targetId) {
  const db = getDb();
  return db.prepare('DELETE FROM temp_group_members WHERE group_id = ? AND target_id = ?').run(groupId, targetId).changes > 0;
}

function getUserTargets() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT
      t.id, t.name, t.ip, t.interface, t.interface_alias,
      t.is_user_target, t.expires_at,
      t.created_at, t.updated_at,
      pr.is_alive,
      pr.min_latency,
      pr.avg_latency,
      pr.max_latency,
      pr.jitter,
      pr.packet_loss,
      pr.packets_sent,
      pr.packets_received,
      pr.created_at AS last_checked_at,
      CASE WHEN t.total_count > 0 THEN t.up_count * 100.0 / t.total_count ELSE NULL END AS uptime_overall
    FROM targets t
    LEFT JOIN ping_results pr ON pr.id = (
      SELECT id FROM ping_results WHERE target_id = t.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE t.is_user_target = 1
      AND (t.expires_at IS NULL OR t.expires_at > ?)
    ORDER BY t.created_at DESC
  `,
    )
    .all(Date.now());
}

// Mark user targets whose lifetime has ended as archived. The target row and
// its ping history are RETAINED (so an availability report can still be
// generated afterwards); active views exclude them via the expires_at filter.
// archived_at is set once, so this only reports each target as newly-expired a
// single time (used to notify clients).
function archiveExpiredUserTargets() {
  const db = getDb();
  const now = Date.now();

  const result = db
    .prepare(
      `UPDATE targets
         SET archived_at = ?
       WHERE is_user_target = 1
         AND expires_at IS NOT NULL
         AND expires_at <= ?
         AND archived_at IS NULL`,
    )
    .run(now, now);

  return result.changes;
}

// Expired user targets for the Expired page. Live rows (retained in `targets`)
// are reportable (they carry the real target_id and keep their ping history);
// legacy rows from the old `expired_targets` archive are summary-only.
function getExpiredTargets() {
  const db = getDb();
  const now = Date.now();
  return db
    .prepare(
      `SELECT
         t.id                                        AS target_id,
         t.name, t.ip, t.interface, t.interface_alias,
         t.created_at                                AS target_created_at,
         t.expires_at                                AS expired_at,
         t.archived_at,
         t.total_count                               AS ping_count,
         CASE WHEN t.total_count > 0 THEN t.up_count * 100.0 / t.total_count ELSE NULL END AS uptime_overall,
         1                                           AS reportable
       FROM targets t
       WHERE t.is_user_target = 1
         AND t.expires_at IS NOT NULL
         AND t.expires_at <= ?
       UNION ALL
       SELECT
         NULL AS target_id,
         name, ip, interface, interface_alias,
         target_created_at, expired_at, archived_at,
         ping_count, uptime_overall,
         0 AS reportable
       FROM expired_targets
       ORDER BY expired_at DESC`,
    )
    .all(now);
}

function cleanupExpiredUserTargets() {
  return archiveExpiredUserTargets();
}


function deleteOldData(retentionDays) {
  const db = getDb();
  const cutoff = Date.now() - retentionDays * 86400000;

  const delPings = db
    .prepare("DELETE FROM ping_results WHERE created_at < ?")
    .run(cutoff);
  const delAlerts = db
    .prepare("DELETE FROM alerts WHERE created_at < ? AND resolved = 1")
    .run(cutoff);
  const delSpeedtest = db
    .prepare("DELETE FROM speedtest_results WHERE created_at < ?")
    .run(cutoff);
  const delUserTargets = cleanupExpiredUserTargets();

  return {
    deletedPings: delPings.changes,
    deletedAlerts: delAlerts.changes,
    deletedSpeedtest: delSpeedtest.changes,
    deletedUserTargets: delUserTargets,
  };
}

function getLatestPingResultForAll() {
  const db = getDb();
  return db
    .prepare(
      `
    SELECT pr.*
    FROM ping_results pr
    INNER JOIN (
      SELECT target_id, MAX(created_at) AS max_ts
      FROM ping_results
      GROUP BY target_id
    ) latest ON pr.target_id = latest.target_id AND pr.created_at = latest.max_ts
  `,
    )
    .all();
}

// ── Speedtest helpers ─────────────────────────────────────────────────────────

function insertSpeedtestResult(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO speedtest_results (download, upload, tool, interface, error, created_at)
    VALUES (@download, @upload, @tool, @interface, @error, @created_at)
  `);
  const result = stmt.run({
    download:   data.download   ?? null,
    upload:     data.upload     ?? null,
    tool:       data.tool       || null,
    interface:  data.interface  || null,
    error:      data.error      || null,
    created_at: data.created_at ?? Date.now(),
  });
  return result.lastInsertRowid;
}

function getSpeedtestResults({ from, to, limit = 100 } = {}) {
  const db    = getDb();
  const fromMs = parseMs(from, 0);
  const toMs   = parseMs(to, Date.now());
  const lim    = Math.min(Number(limit) || 100, 1000);

  return db
    .prepare(
      `SELECT * FROM speedtest_results
       WHERE created_at >= ? AND created_at <= ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(fromMs, toMs, lim);
}

function getLatestSpeedtestResult() {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT * FROM speedtest_results ORDER BY created_at DESC LIMIT 1`,
      )
      .get() || null
  );
}

module.exports = {
  getDb,
  initDatabase,
  syncTargets,
  insertPingResult,
  getLatestPingResult,
  getAllTargetsWithLatest,
  getActiveTargetsForPing,
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
  addUserTarget,
  deleteUserTarget,
  updateUserTarget,
  getUserTargets,
  listTempGroups,
  createTempGroup,
  updateTempGroup,
  deleteTempGroup,
  setTempGroupMembers,
  addTempGroupMember,
  removeTempGroupMember,
  cleanupExpiredUserTargets,
  archiveExpiredUserTargets,
  getExpiredTargets,
  insertSpeedtestResult,
  getSpeedtestResults,
  getLatestSpeedtestResult,
};
