#!/usr/bin/env node
"use strict";

/**
 * nuke-db.js — Completely wipe the n8watch SQLite database and recreate a
 * fresh, empty schema.  Unlike flush-data.js (which deletes rows), this
 * script deletes the database file itself (including any WAL / SHM sidecar
 * files) and then recreates an empty database with the same schema the
 * application uses.  Auto-increment counters are reset and no data survives.
 *
 * Usage:
 *   node scripts/nuke-db.js [--yes]
 *
 * Options:
 *   --yes   Skip the confirmation prompt (useful in CI / automated scripts)
 *
 * Examples:
 *   node scripts/nuke-db.js           # interactive — asks for confirmation
 *   node scripts/nuke-db.js --yes     # non-interactive full wipe
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const args = process.argv.slice(2);
const skipConfirm = args.includes("--yes");

// Resolve the database path the same way the server and flush-data.js do.
const dataDir = process.env.n8watch_DATA_DIR
  ? path.resolve(process.env.n8watch_DATA_DIR)
  : path.join(__dirname, "..", "data");

const dbPath = path.join(dataDir, "n8watch.db");

function recreateSchema(Database) {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS targets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      ip              TEXT    NOT NULL UNIQUE,
      grp             TEXT,
      interface       TEXT,
      interface_alias TEXT,
      is_user_target  INTEGER NOT NULL DEFAULT 0,
      expires_at      INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
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

  db.close();
}

function nuke() {
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    console.error(
      'ERROR: better-sqlite3 is not installed. Run "npm install" first.',
    );
    process.exit(1);
  }

  // Delete the main database file and any WAL / SHM sidecar files.
  const filesToDelete = [dbPath, dbPath + "-wal", dbPath + "-shm"];
  let deleted = false;
  for (const f of filesToDelete) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      deleted = true;
    }
  }

  if (deleted) {
    console.log(`  Deleted database file(s) under ${dataDir}`);
  } else {
    console.log(
      "  No existing database found — creating a fresh one from scratch.",
    );
  }

  // Recreate the directory (may have been wiped) and the empty schema.
  fs.mkdirSync(dataDir, { recursive: true });
  recreateSchema(Database);

  console.log("Done! A fresh, empty database has been created.");
  console.log(
    "  Start the application — targets from config.yaml will be loaded on the next ping cycle.",
  );
  console.log("");
}

console.log("");
console.log("n8watch — Nuke Database");
console.log("=================================");
console.log(`Database : ${dbPath}`);
console.log(
  "WARNING  : This will permanently delete ALL data — ping results, alerts,",
);
console.log(
  "           and targets.  The database file will be removed and recreated",
);
console.log("           from scratch.  This action cannot be undone.");
console.log("");

if (skipConfirm) {
  nuke();
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "Type YES (in uppercase) to confirm and wipe the database: ",
  (answer) => {
    rl.close();
    if (answer.trim() === "YES") {
      nuke();
    } else {
      console.log("Aborted. Database has not been modified.");
      console.log("");
    }
  },
);
