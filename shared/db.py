"""
SQLite database access: schema initialization, WAL mode, connection helpers.
"""
import sqlite3
import time
from typing import Optional


SCHEMA = """
CREATE TABLE IF NOT EXISTS interface_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    iface TEXT NOT NULL,
    admin_up INTEGER NOT NULL,
    link_up INTEGER NOT NULL,
    state TEXT NOT NULL,
    raw_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_iface_ts ON interface_samples (iface, ts);
CREATE INDEX IF NOT EXISTS idx_ts ON interface_samples (ts);

CREATE TABLE IF NOT EXISTS ping_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    target_name TEXT NOT NULL,
    target_ip TEXT NOT NULL,
    success INTEGER NOT NULL,
    sent INTEGER NOT NULL,
    received INTEGER NOT NULL,
    loss_pct REAL NOT NULL,
    rtt_min_ms REAL,
    rtt_avg_ms REAL,
    rtt_max_ms REAL,
    error TEXT,
    raw_text TEXT
);
CREATE INDEX IF NOT EXISTS idx_ping_target_ts ON ping_samples (target_name, ts);
CREATE INDEX IF NOT EXISTS idx_ping_ts_only ON ping_samples (ts);
"""


def get_connection(path: str) -> sqlite3.Connection:
    """Return a SQLite connection with row_factory set."""
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(path: str) -> None:
    """Create tables, set WAL mode and recommended pragmas."""
    conn = get_connection(path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA temp_store=MEMORY")
        conn.execute("PRAGMA mmap_size=268435456")  # 256 MB
        conn.execute("PRAGMA cache_size=-16000")     # ~16 MB
        conn.execute("PRAGMA foreign_keys=ON")
        for statement in SCHEMA.strip().split(";"):
            stmt = statement.strip()
            if stmt:
                conn.execute(stmt)
        conn.commit()
    finally:
        conn.close()


def insert_interface_sample(
    conn: sqlite3.Connection,
    ts: int,
    iface: str,
    admin_up: bool,
    link_up: bool,
    state: str,
    raw_json: Optional[str] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO interface_samples (ts, iface, admin_up, link_up, state, raw_json)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (ts, iface, int(admin_up), int(link_up), state, raw_json),
    )
    conn.commit()


def insert_ping_sample(
    conn: sqlite3.Connection,
    ts: int,
    target_name: str,
    target_ip: str,
    success: bool,
    sent: int,
    received: int,
    loss_pct: float,
    rtt_min: Optional[float] = None,
    rtt_avg: Optional[float] = None,
    rtt_max: Optional[float] = None,
    error: Optional[str] = None,
    raw_text: Optional[str] = None,
) -> None:
    conn.execute(
        """
        INSERT INTO ping_samples
            (ts, target_name, target_ip, success, sent, received, loss_pct,
             rtt_min_ms, rtt_avg_ms, rtt_max_ms, error, raw_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ts, target_name, target_ip, int(success), sent, received, loss_pct,
            rtt_min, rtt_avg, rtt_max, error, raw_text,
        ),
    )
    conn.commit()


def cleanup_old_data(conn: sqlite3.Connection, retention_days: int) -> None:
    """Delete rows older than retention_days."""
    cutoff = int(time.time()) - retention_days * 86400
    conn.execute("DELETE FROM interface_samples WHERE ts < ?", (cutoff,))
    conn.execute("DELETE FROM ping_samples WHERE ts < ?", (cutoff,))
    conn.commit()
