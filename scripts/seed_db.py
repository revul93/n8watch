#!/usr/bin/env python3
"""
seed_db.py — Populate the n8watch SQLite database with realistic mock data.

Usage:
    python scripts/seed_db.py [--db PATH] [--days N]

Options:
    --db PATH    Path to the SQLite database file
                 (default: /var/lib/n8watch/monitor.db, or N8WATCH_DB env var)
    --days N     Number of days of historical data to generate (default: 7)

The script initialises the schema if the database does not yet exist, then
inserts one interface sample and one ping sample per configured interface /
gateway per polling interval (30-second buckets by default).
"""
import argparse
import json
import math
import os
import random
import sqlite3
import sys
import time

# Allow running from the repo root without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.db import init_db, get_connection

# ── Mock topology ─────────────────────────────────────────────────────────────

INTERFACES = [
    {"name": "wan1", "usually_up": True},
    {"name": "wan2", "usually_up": True},
    {"name": "port1", "usually_up": True},
    {"name": "port2", "usually_up": False},  # Admin down most of the time
]

GATEWAYS = [
    {"name": "gw-wan1", "ip": "10.0.0.1", "usually_reachable": True},
    {"name": "gw-wan2", "ip": "10.0.1.1", "usually_reachable": True},
    {"name": "gw-lan",  "ip": "192.168.1.254", "usually_reachable": True},
]

POLL_INTERVAL = 30        # seconds between samples
OUTAGE_PROB   = 0.003     # probability of an outage starting per sample
OUTAGE_DUR    = (2, 10)   # range of outage duration in samples


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_iface_raw(iface: str, admin_up: bool, link_up: bool) -> str:
    return json.dumps({
        "name": iface,
        "admin_status": "up" if admin_up else "down",
        "link_status": "up" if link_up else "down",
    })


def _make_ping_raw(success: bool, sent: int, received: int) -> str:
    return (
        f"PING 10.0.0.1: {sent} packets transmitted, "
        f"{received} packets received, "
        f"{round((sent - received) / sent * 100)}% packet loss"
    )


def _rtt(base_ms: float, jitter: float) -> float:
    return round(max(0.1, base_ms + random.uniform(-jitter, jitter)), 2)


# ── Data generators ───────────────────────────────────────────────────────────

def generate_interface_samples(days: int):
    """Yield (ts, iface, admin_up, link_up, state, raw_json) rows."""
    now = int(time.time())
    start = now - days * 86400
    steps = range(start, now, POLL_INTERVAL)

    # Track outage state per interface
    outage_remaining = {iface["name"]: 0 for iface in INTERFACES}

    for ts in steps:
        for iface in INTERFACES:
            name = iface["name"]
            usually_up = iface["usually_up"]

            if outage_remaining[name] > 0:
                outage_remaining[name] -= 1
                admin_up = usually_up  # admin status unchanged during link outage
                link_up = False
            else:
                if usually_up and random.random() < OUTAGE_PROB:
                    outage_remaining[name] = random.randint(*OUTAGE_DUR)
                    admin_up = True
                    link_up = False
                else:
                    admin_up = usually_up
                    link_up = usually_up

            if not admin_up:
                state = "ADMIN_DOWN"
            elif not link_up:
                state = "LINK_DOWN"
            else:
                state = "UP"

            raw_json = _make_iface_raw(name, admin_up, link_up)
            yield (ts, name, int(admin_up), int(link_up), state, raw_json)


def generate_ping_samples(days: int):
    """Yield (ts, target_name, target_ip, success, sent, rcvd, loss, min, avg, max, err, raw) rows."""
    now = int(time.time())
    start = now - days * 86400
    steps = range(start, now, POLL_INTERVAL)

    outage_remaining = {gw["name"]: 0 for gw in GATEWAYS}

    for ts in steps:
        for gw in GATEWAYS:
            name = gw["name"]
            ip   = gw["ip"]
            usually_reachable = gw["usually_reachable"]

            sent = 5
            if outage_remaining[name] > 0:
                outage_remaining[name] -= 1
                success = False
                received = 0
            else:
                if usually_reachable and random.random() < OUTAGE_PROB:
                    outage_remaining[name] = random.randint(*OUTAGE_DUR)
                    success = False
                    received = random.randint(0, sent - 1)
                else:
                    success = usually_reachable
                    received = sent if success else 0

            loss_pct = round((sent - received) / sent * 100, 1)

            if received > 0:
                base_rtt = 1.5 + random.uniform(0, 3)
                rtt_min = _rtt(base_rtt - 0.5, 0.2)
                rtt_avg = _rtt(base_rtt, 0.3)
                rtt_max = _rtt(base_rtt + 0.5, 0.3)
                # Ensure ordering
                rtt_min, rtt_max = min(rtt_min, rtt_max), max(rtt_min, rtt_max)
                rtt_avg = max(rtt_min, min(rtt_avg, rtt_max))
                error = None
            else:
                rtt_min = rtt_avg = rtt_max = None
                error = "Request timeout" if not usually_reachable else None

            raw_text = _make_ping_raw(success, sent, received)
            yield (ts, name, ip, int(success), sent, received, loss_pct,
                   rtt_min, rtt_avg, rtt_max, error, raw_text)


# ── Insertion ─────────────────────────────────────────────────────────────────

def seed(db_path: str, days: int) -> None:
    print(f"[seed_db] Initialising database at {db_path!r} …")
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    init_db(db_path)

    conn = get_connection(db_path)
    try:
        print(f"[seed_db] Generating {days} day(s) of interface samples …")
        iface_rows = list(generate_interface_samples(days))
        conn.executemany(
            "INSERT INTO interface_samples (ts, iface, admin_up, link_up, state, raw_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            iface_rows,
        )

        print(f"[seed_db] Generating {days} day(s) of ping samples …")
        ping_rows = list(generate_ping_samples(days))
        conn.executemany(
            "INSERT INTO ping_samples "
            "(ts, target_name, target_ip, success, sent, received, loss_pct, "
            " rtt_min_ms, rtt_avg_ms, rtt_max_ms, error, raw_text) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ping_rows,
        )

        conn.commit()
        print(
            f"[seed_db] ✅ Inserted {len(iface_rows)} interface samples "
            f"and {len(ping_rows)} ping samples."
        )
    finally:
        conn.close()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    default_db = os.environ.get("N8WATCH_DB", "/var/lib/n8watch/monitor.db")

    parser = argparse.ArgumentParser(description="Seed the n8watch database with mock data.")
    parser.add_argument("--db",   default=default_db, help="Path to the SQLite database file")
    parser.add_argument("--days", type=int, default=7, help="Days of history to generate (default: 7)")
    args = parser.parse_args()

    seed(args.db, args.days)


if __name__ == "__main__":
    main()
