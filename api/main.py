"""
FortiGate Monitor API: FastAPI application serving REST endpoints and React dashboard.
"""
import os
import sys

# Allow running as `uvicorn api.main:app` from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from api.routers import health, latest, history

app = FastAPI(title="FortiGate Monitor", version="1.0.0")

app.include_router(health.router)
app.include_router(latest.router)
app.include_router(history.router)

# Serve React dashboard static files
_DIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard", "dist")

if os.path.isdir(_DIST_DIR):
    app.mount("/", StaticFiles(directory=_DIST_DIR, html=True), name="static")
