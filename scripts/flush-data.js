#!/usr/bin/env node
"use strict";

/**
 * flush-data.js — Clear stored data from the n8watch SQLite database.
 *
 * Usage:
 *   node scripts/flush-data.js [options]
 *
 * Options:
 *   --ping-results   Delete all ping results (default when no flag is given)
 *   --alerts         Delete all alert records
 *   --all            Delete ping results, alerts, and all targets
 *   --yes            Skip the confirmation prompt
 *
 * Examples:
 *   node scripts/flush-data.js                    # flush ping results only
 *   node scripts/flush-data.js --alerts           # flush alert records only
 *   node scripts/flush-data.js --ping-results --alerts  # flush both
 *   node scripts/flush-data.js --all              # flush everything
 *   node scripts/flush-data.js --all --yes        # non-interactive full flush
 */

const path = require("path");
const readline = require("readline");

const args = process.argv.slice(2);

const flushAll = args.includes("--all");
const flushAlerts = flushAll || args.includes("--alerts");
// Default to flushing ping results when no data-type flag is provided.
const noDataFlag =
  !args.includes("--alerts") &&
  !args.includes("--all") &&
  !args.includes("--ping-results");
const flushPingResults =
  flushAll || args.includes("--ping-results") || noDataFlag;
const skipConfirm = args.includes("--yes");

// Resolve the database path the same way the server does.
const dataDir = process.env.n8watch_DATA_DIR
  ? path.resolve(process.env.n8watch_DATA_DIR)
  : path.join(__dirname, "..", "data");

const dbPath = path.join(dataDir, "n8watch.db");

function run() {
  // Lazy-require so we get a clear error if better-sqlite3 isn't installed yet.
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch {
    console.error(
      'ERROR: better-sqlite3 is not installed. Run "npm install" first.',
    );
    process.exit(1);
  }

  if (!require("fs").existsSync(dbPath)) {
    console.error(`ERROR: Database not found at ${dbPath}`);
    console.error(
      "       Run the application at least once to create the database.",
    );
    process.exit(1);
  }

  const db = new Database(dbPath);

  const summary = [];
  if (flushPingResults) summary.push("ping results");
  if (flushAlerts) summary.push("alerts");
  if (flushAll) summary.push("targets");

  console.log("");
  console.log("n8watch — Flush Database Data");
  console.log("=================================");
  console.log(`Database : ${dbPath}`);
  console.log(`Will delete: ${summary.join(", ")}`);
  console.log("");

  function flush() {
    // Disable foreign-key enforcement so we can delete parent rows (targets)
    // without needing to cascade-delete child rows (ping_results, alerts) first.
    db.pragma("foreign_keys = OFF");

    const tx = db.transaction(() => {
      let pings = 0,
        alerts = 0,
        targets = 0;

      if (flushPingResults) {
        pings = db.prepare("DELETE FROM ping_results").run().changes;
      }
      if (flushAlerts) {
        alerts = db.prepare("DELETE FROM alerts").run().changes;
      }
      if (flushAll) {
        targets = db.prepare("DELETE FROM targets").run().changes;
      }

      return { pings, alerts, targets };
    });

    const result = tx();
    db.pragma("foreign_keys = ON");

    // Reclaim disk space after large deletes (must run outside a transaction).
    db.exec("VACUUM");

    console.log("Done!");
    if (flushPingResults)
      console.log(`  Deleted ${result.pings} ping result(s)`);
    if (flushAlerts) console.log(`  Deleted ${result.alerts} alert record(s)`);
    if (flushAll) console.log(`  Deleted ${result.targets} target(s)`);
    console.log("");

    db.close();
  }

  if (skipConfirm) {
    flush();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question(
    `Are you sure you want to delete ${summary.join(", ")}? [y/N]: `,
    (answer) => {
      rl.close();
      if (/^[Yy]$/.test(answer.trim())) {
        flush();
      } else {
        console.log("Aborted. No data was deleted.");
        console.log("");
        db.close();
      }
    },
  );
}

run();
