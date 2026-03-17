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
