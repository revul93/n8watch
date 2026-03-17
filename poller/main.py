"""
FortiGate monitor poller: main loop with systemd-friendly graceful shutdown.
"""
import json
import logging
import os
import signal
import sqlite3
import sys
import time

# Allow running as `python -m poller.main` from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import get_config, Config
from shared.db import init_db, get_connection, insert_interface_sample, insert_ping_sample, cleanup_old_data
from poller.fortigate_api import FortiGateAPI, FortiGateAPIError
from poller.fortigate_ssh import FortiGateSSH, FortiGateSSHError

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format='{"ts": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "msg": "%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("forti-poller")

_shutdown = False


def _handle_sigterm(signum, frame):
    global _shutdown
    logger.info("SIGTERM received, shutting down...")
    _shutdown = True


signal.signal(signal.SIGTERM, _handle_sigterm)
signal.signal(signal.SIGINT, _handle_sigterm)


def _determine_state(admin_up: bool, link_up: bool) -> str:
    if not admin_up:
        return "ADMIN_DOWN"
    if not link_up:
        return "LINK_DOWN"
    return "UP"


def _poll_interface(
    iface: str,
    api: FortiGateAPI,
    cfg: Config,
) -> dict:
    """Poll interface status via API, fallback to SSH."""
    try:
        result = api.get_interface_status(iface)
        logger.info(f"API poll interface {iface}: admin_up={result['admin_up']}, link_up={result['link_up']}")
        return result
    except FortiGateAPIError as e:
        logger.warning(f"API failed for {iface}: {e}, falling back to SSH")

    ssh_cfg = cfg.fortigate.ssh
    ssh = FortiGateSSH(
        host=ssh_cfg.host,
        port=ssh_cfg.port,
        username=ssh_cfg.username,
        key_file=ssh_cfg.key_file,
        password=ssh_cfg.password,
        timeout=ssh_cfg.timeout,
        verify_host_key=ssh_cfg.verify_host_key,
    )
    try:
        result = ssh.get_interface_status(iface)
        logger.info(f"SSH poll interface {iface}: admin_up={result['admin_up']}, link_up={result['link_up']}")
        return result
    except FortiGateSSHError as e:
        logger.error(f"SSH also failed for {iface}: {e}")
        return {"admin_up": False, "link_up": False, "raw_json": None, "raw_text": str(e)}


def _poll_ping(target_name: str, target_ip: str, cfg: Config) -> dict:
    """Run ping via SSH (or API-based ping if api_ping_enabled)."""
    ssh_cfg = cfg.fortigate.ssh
    ssh = FortiGateSSH(
        host=ssh_cfg.host,
        port=ssh_cfg.port,
        username=ssh_cfg.username,
        key_file=ssh_cfg.key_file,
        password=ssh_cfg.password,
        timeout=ssh_cfg.timeout,
        verify_host_key=ssh_cfg.verify_host_key,
    )
    try:
        result = ssh.run_ping(
            target_ip=target_ip,
            count=cfg.ping_count,
            timeout=cfg.ping_timeout_seconds,
        )
        logger.info(
            f"Ping {target_name} ({target_ip}): success={result['success']}, "
            f"loss={result['loss_pct']}%, rtt_avg={result['rtt_avg_ms']}"
        )
        return result
    except FortiGateSSHError as e:
        logger.error(f"Ping failed for {target_name}: {e}")
        return {
            "success": False,
            "sent": 0,
            "received": 0,
            "loss_pct": 100.0,
            "rtt_min_ms": None,
            "rtt_avg_ms": None,
            "rtt_max_ms": None,
            "error": str(e),
            "raw_text": "",
        }


def _run_poll_cycle(cfg: Config, conn: sqlite3.Connection, api: FortiGateAPI) -> None:
    ts = int(time.time())

    for iface in cfg.interfaces:
        try:
            result = _poll_interface(iface, api, cfg)
            admin_up = result.get("admin_up", False)
            link_up = result.get("link_up", False)
            state = _determine_state(admin_up, link_up)
            raw_json = result.get("raw_json")
            if raw_json is None and "raw_text" in result:
                raw_json = json.dumps({"raw_text": result["raw_text"]})
            insert_interface_sample(conn, ts, iface, admin_up, link_up, state, raw_json)
        except Exception as e:
            logger.error(f"Unexpected error polling interface {iface}: {e}")

    for gw in cfg.gateways:
        try:
            result = _poll_ping(gw.name, gw.ip, cfg)
            insert_ping_sample(
                conn,
                ts,
                gw.name,
                gw.ip,
                result["success"],
                result["sent"],
                result["received"],
                result["loss_pct"],
                rtt_min=result.get("rtt_min_ms"),
                rtt_avg=result.get("rtt_avg_ms"),
                rtt_max=result.get("rtt_max_ms"),
                error=result.get("error"),
                raw_text=result.get("raw_text"),
            )
        except Exception as e:
            logger.error(f"Unexpected error polling gateway {gw.name}: {e}")


def main() -> None:
    logger.info("Starting FortiGate poller")

    try:
        cfg = get_config()
    except FileNotFoundError as e:
        logger.error(f"Config file not found: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        sys.exit(1)

    logger.info(f"DB path: {cfg.sqlite_path}")
    db_dir = os.path.dirname(cfg.sqlite_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    try:
        init_db(cfg.sqlite_path)
    except Exception as e:
        logger.error(f"Failed to initialize DB: {e}")
        sys.exit(1)

    conn = get_connection(cfg.sqlite_path)

    api = FortiGateAPI(
        host=cfg.fortigate.host,
        api_token=cfg.fortigate.api_token,
        verify_ssl=cfg.fortigate.verify_ssl,
    )

    last_cleanup = time.monotonic()
    poll_interval = cfg.polling_interval_seconds

    logger.info(f"Poll interval: {poll_interval}s, interfaces: {cfg.interfaces}, gateways: {[g.name for g in cfg.gateways]}")

    while not _shutdown:
        cycle_start = time.monotonic()

        try:
            _run_poll_cycle(cfg, conn, api)
        except Exception as e:
            logger.error(f"Poll cycle error: {e}")

        # Hourly cleanup
        now_mono = time.monotonic()
        if now_mono - last_cleanup >= 3600:
            try:
                cleanup_old_data(conn, cfg.retention_days)
                logger.info("Cleaned up old data")
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
            last_cleanup = now_mono

        elapsed = time.monotonic() - cycle_start
        sleep_time = max(0.0, poll_interval - elapsed)

        logger.info(f"Cycle took {elapsed:.1f}s, sleeping {sleep_time:.1f}s")

        # Sleep in small increments to allow quick shutdown
        slept = 0.0
        while slept < sleep_time and not _shutdown:
            chunk = min(1.0, sleep_time - slept)
            time.sleep(chunk)
            slept += chunk

    conn.close()
    logger.info("Poller stopped")


if __name__ == "__main__":
    main()
