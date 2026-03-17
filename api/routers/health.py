import time
from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "ts": int(time.time())}
