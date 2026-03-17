import time
from typing import Optional
import aiosqlite
from fastapi import APIRouter, Depends, Query

from api.deps import get_db_path

router = APIRouter()

_DEFAULT_FROM = lambda: int(time.time()) - 3600
_DEFAULT_TO = lambda: int(time.time())


@router.get("/api/history/interfaces")
async def history_interfaces(
    iface: Optional[str] = None,
    from_ts: Optional[int] = Query(None, alias="from"),
    to_ts: Optional[int] = Query(None, alias="to"),
    db_path: str = Depends(get_db_path),
):
    now = int(time.time())
    from_ts = from_ts if from_ts is not None else now - 3600
    to_ts = to_ts if to_ts is not None else now

    query = "SELECT id, ts, iface, admin_up, link_up, state, raw_json FROM interface_samples WHERE ts >= ? AND ts <= ?"
    params = [from_ts, to_ts]
    if iface:
        query += " AND iface = ?"
        params.append(iface)
    query += " ORDER BY ts DESC LIMIT 10000"

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.get("/api/history/pings")
async def history_pings(
    target: Optional[str] = None,
    from_ts: Optional[int] = Query(None, alias="from"),
    to_ts: Optional[int] = Query(None, alias="to"),
    db_path: str = Depends(get_db_path),
):
    now = int(time.time())
    from_ts = from_ts if from_ts is not None else now - 3600
    to_ts = to_ts if to_ts is not None else now

    query = (
        "SELECT id, ts, target_name, target_ip, success, sent, received, "
        "loss_pct, rtt_min_ms, rtt_avg_ms, rtt_max_ms, error FROM ping_samples "
        "WHERE ts >= ? AND ts <= ?"
    )
    params = [from_ts, to_ts]
    if target:
        query += " AND target_name = ?"
        params.append(target)
    query += " ORDER BY ts DESC LIMIT 10000"

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.get("/api/history/interfaces/series")
async def interfaces_series(
    iface: Optional[str] = None,
    from_ts: Optional[int] = Query(None, alias="from"),
    to_ts: Optional[int] = Query(None, alias="to"),
    bucket: int = 60,
    db_path: str = Depends(get_db_path),
):
    now = int(time.time())
    from_ts = from_ts if from_ts is not None else now - 3600
    to_ts = to_ts if to_ts is not None else now
    if bucket < 1:
        bucket = 60

    query = (
        f"SELECT (ts / {bucket}) * {bucket} AS bucket_ts, state, COUNT(*) as cnt "
        "FROM interface_samples WHERE ts >= ? AND ts <= ?"
    )
    params = [from_ts, to_ts]
    if iface:
        query += " AND iface = ?"
        params.append(iface)
    query += f" GROUP BY bucket_ts, state ORDER BY bucket_ts"

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

    # Aggregate per bucket: pick most common state
    buckets: dict = {}
    for row in rows:
        bt = row["bucket_ts"]
        if bt not in buckets:
            buckets[bt] = {}
        buckets[bt][row["state"]] = buckets[bt].get(row["state"], 0) + row["cnt"]

    result = []
    for bt in sorted(buckets.keys()):
        states = buckets[bt]
        most_common = max(states, key=states.get)
        total = sum(states.values())
        result.append({"ts": bt, "state": most_common, "count": total})
    return result


@router.get("/api/history/pings/series")
async def pings_series(
    target: Optional[str] = None,
    from_ts: Optional[int] = Query(None, alias="from"),
    to_ts: Optional[int] = Query(None, alias="to"),
    bucket: int = 60,
    db_path: str = Depends(get_db_path),
):
    now = int(time.time())
    from_ts = from_ts if from_ts is not None else now - 3600
    to_ts = to_ts if to_ts is not None else now
    if bucket < 1:
        bucket = 60

    query = (
        f"SELECT (ts / {bucket}) * {bucket} AS bucket_ts, "
        "AVG(loss_pct) as avg_loss_pct, AVG(rtt_avg_ms) as avg_rtt_ms, COUNT(*) as cnt "
        "FROM ping_samples WHERE ts >= ? AND ts <= ?"
    )
    params = [from_ts, to_ts]
    if target:
        query += " AND target_name = ?"
        params.append(target)
    query += " GROUP BY bucket_ts ORDER BY bucket_ts"

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

    return [
        {
            "ts": row["bucket_ts"],
            "avg_loss_pct": row["avg_loss_pct"],
            "avg_rtt_ms": row["avg_rtt_ms"],
            "count": row["cnt"],
        }
        for row in rows
    ]
