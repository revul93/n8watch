"""
FastAPI dependency injection helpers.
"""
import os
from shared.config import get_config


def get_db_path() -> str:
    """Return the SQLite database path from config."""
    cfg = get_config()
    return cfg.sqlite_path
