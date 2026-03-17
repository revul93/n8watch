import time
import aiosqlite
from fastapi import APIRouter, Depends
from typing import List, Optional

from api.deps import get_db_path

router = APIRouter()


@router.get("/api/latest")
async def get_latest(db_path: str = Depends(get_db_path)):
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # Latest sample per interface
        cursor = await db.execute(
            """
            SELECT iface, ts, admin_up, link_up, state
            FROM interface_samples
            WHERE id IN (
                SELECT MAX(id) FROM interface_samples GROUP BY iface
            )
            ORDER BY iface
            """
        )
        rows = await cursor.fetchall()
        interfaces = [dict(row) for row in rows]

        # Latest sample per target
        cursor = await db.execute(
            """
            SELECT target_name, target_ip, ts, success, loss_pct, rtt_avg_ms
            FROM ping_samples
            WHERE id IN (
                SELECT MAX(id) FROM ping_samples GROUP BY target_name
            )
            ORDER BY target_name
            """
        )
        rows = await cursor.fetchall()
        pings = [dict(row) for row in rows]

    return {"interfaces": interfaces, "pings": pings}
