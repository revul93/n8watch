#!/usr/bin/env node
'use strict';

/**
 * flush-db.js — Wipe all collected data from the n8netwatch database.
 *
 * Deletes every row from the ping_results, alerts, and targets tables
 * (including the SQLite sequences so IDs restart from 1).
 *
 * Usage:
 *   node scripts/flush-db.js           # interactive confirmation prompt
 *   node scripts/flush-db.js --yes     # skip the confirmation prompt
 *
 * The database path is resolved the same way the server does:
 *   - $N8NETWATCH_DATA_DIR/n8netwatch.db  (when the env-var is set)
 *   - <project-root>/data/n8netwatch.db   (default)
 */

const path = require('path');
const fs   = require('fs');
const readline = require('readline');

// ── Resolve database path ─────────────────────────────────────────────────────

const dataDir = process.env.N8NETWATCH_DATA_DIR
  ? path.resolve(process.env.N8NETWATCH_DATA_DIR)
  : path.join(__dirname, '..', 'data');

const dbPath = path.join(dataDir, 'n8netwatch.db');

if (!fs.existsSync(dbPath)) {
  console.error(`No database found at: ${dbPath}`);
  console.error('Nothing to flush.');
  process.exit(0);
}

// ── Confirmation ──────────────────────────────────────────────────────────────

const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

function run() {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  db.pragma('foreign_keys = OFF');

  const counts = {
    ping_results: db.prepare('SELECT COUNT(*) AS n FROM ping_results').get().n,
    alerts:       db.prepare('SELECT COUNT(*) AS n FROM alerts').get().n,
    targets:      db.prepare('SELECT COUNT(*) AS n FROM targets').get().n,
  };

  console.log('\nRows to be deleted:');
  console.log(`  ping_results : ${counts.ping_results}`);
  console.log(`  alerts       : ${counts.alerts}`);
  console.log(`  targets      : ${counts.targets}`);

  if (counts.ping_results === 0 && counts.alerts === 0 && counts.targets === 0) {
    console.log('\nDatabase is already empty. Nothing to do.');
    db.close();
    return;
  }

  const flush = db.transaction(() => {
    db.prepare('DELETE FROM ping_results').run();
    db.prepare('DELETE FROM alerts').run();
    db.prepare('DELETE FROM targets').run();
    // Reset auto-increment sequences
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('ping_results','alerts','targets')").run();
  });

  flush();
  db.pragma('foreign_keys = ON');
  db.close();

  console.log('\n✓ Database flushed successfully.');
}

if (skipConfirm) {
  run();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(
    `\nThis will permanently delete ALL data in:\n  ${dbPath}\n\nAre you sure? [y/N]: `,
    (answer) => {
      rl.close();
      if (/^[Yy]$/.test(answer.trim())) {
        run();
      } else {
        console.log('Aborted. No data was deleted.');
      }
    }
  );
}
