#!/usr/bin/env python3
"""
nuke_db.py — Wipe all data from the n8watch SQLite database.

Usage:
    python scripts/nuke_db.py [--db PATH] [--reinit]

Options:
    --db PATH   Path to the SQLite database file
                (default: /var/lib/n8watch/monitor.db, or N8WATCH_DB env var)
    --reinit    Re-create the schema after wiping (default: schema is preserved)
    --yes       Skip the confirmation prompt

WARNING: This action is irreversible. All rows in interface_samples and
         ping_samples will be permanently deleted.
"""
import argparse
import os
import sys

# Allow running from the repo root without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import get_connection, init_db


def nuke(db_path: str, reinit: bool) -> None:
    if not os.path.exists(db_path):
        print(f"[nuke_db] Database not found at {db_path!r}. Nothing to do.")
        return

    conn = get_connection(db_path)
    try:
        cur = conn.execute("SELECT COUNT(*) FROM interface_samples")
        iface_count = cur.fetchone()[0]
        cur = conn.execute("SELECT COUNT(*) FROM ping_samples")
        ping_count = cur.fetchone()[0]

        print(f"[nuke_db] Deleting {iface_count} interface sample(s) …")
        conn.execute("DELETE FROM interface_samples")

        print(f"[nuke_db] Deleting {ping_count} ping sample(s) …")
        conn.execute("DELETE FROM ping_samples")

        conn.commit()
        print("[nuke_db] Running VACUUM to reclaim disk space …")
        conn.execute("VACUUM")
        print(f"[nuke_db] ✅ Database wiped ({iface_count} interface rows, {ping_count} ping rows removed).")
    finally:
        conn.close()

    if reinit:
        print("[nuke_db] Re-initialising schema …")
        init_db(db_path)
        print("[nuke_db] ✅ Schema re-initialised.")


def main() -> None:
    default_db = os.environ.get("N8WATCH_DB", "/var/lib/n8watch/monitor.db")

    parser = argparse.ArgumentParser(
        description="Wipe all data from the n8watch database."
    )
    parser.add_argument("--db",     default=default_db, help="Path to the SQLite database file")
    parser.add_argument("--reinit", action="store_true", help="Re-create schema after wiping")
    parser.add_argument("--yes",    action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if not args.yes:
        answer = input(
            f"⚠️  This will permanently delete ALL data in {args.db!r}.\n"
            "Type 'yes' to confirm: "
        ).strip().lower()
        if answer != "yes":
            print("[nuke_db] Aborted.")
            sys.exit(0)

    nuke(args.db, args.reinit)


if __name__ == "__main__":
    main()
