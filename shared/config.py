"""
YAML configuration loader with environment variable substitution.
"""
import os
import re
import yaml
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

CONFIG_PATH_ENV = "N8WATCH_CONFIG"
DEFAULT_CONFIG_PATH = "/etc/n8watch/config.yaml"

_ENV_VAR_PATTERN = re.compile(r'\$\{([^}]+)\}')


def _substitute_env_vars(value: Any) -> Any:
    """Recursively substitute ${VAR_NAME} patterns with environment variables."""
    if isinstance(value, str):
        def replace(m):
            var_name = m.group(1)
            return os.environ.get(var_name, m.group(0))
        return _ENV_VAR_PATTERN.sub(replace, value)
    elif isinstance(value, dict):
        return {k: _substitute_env_vars(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_substitute_env_vars(item) for item in value]
    return value


@dataclass
class SSHConfig:
    host: str = ""
    port: int = 22
    username: str = "admin"
    key_file: Optional[str] = None
    password: Optional[str] = None
    timeout: int = 10
    verify_host_key: bool = False
    known_hosts_file: Optional[str] = None


@dataclass
class FortiGateConfig:
    host: str = "192.168.1.1"
    api_token: str = ""
    verify_ssl: bool = False
    ssh: SSHConfig = field(default_factory=SSHConfig)


@dataclass
class GatewayConfig:
    name: str = ""
    ip: str = ""


@dataclass
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8000


@dataclass
class Config:
    fortigate: FortiGateConfig = field(default_factory=FortiGateConfig)
    interfaces: List[str] = field(default_factory=list)
    gateways: List[GatewayConfig] = field(default_factory=list)
    polling_interval_seconds: int = 30
    ping_count: int = 5
    ping_timeout_seconds: int = 3
    retention_days: int = 30
    sqlite_path: str = "/var/lib/n8watch/monitor.db"
    server: ServerConfig = field(default_factory=ServerConfig)
    api_ping_enabled: bool = False


def _build_config(raw: dict) -> Config:
    cfg = Config()

    fg_raw = raw.get("fortigate", {})
    ssh_raw = fg_raw.get("ssh", {})
    cfg.fortigate = FortiGateConfig(
        host=fg_raw.get("host", "192.168.1.1"),
        api_token=fg_raw.get("api_token", ""),
        verify_ssl=bool(fg_raw.get("verify_ssl", False)),
        ssh=SSHConfig(
            host=ssh_raw.get("host", fg_raw.get("host", "")),
            port=int(ssh_raw.get("port", 22)),
            username=ssh_raw.get("username", "admin"),
            key_file=ssh_raw.get("key_file"),
            password=ssh_raw.get("password"),
            timeout=int(ssh_raw.get("timeout", 10)),
            verify_host_key=bool(ssh_raw.get("verify_host_key", False)),
            known_hosts_file=ssh_raw.get("known_hosts_file"),
        ),
    )

    cfg.interfaces = raw.get("interfaces", [])

    gateways_raw = raw.get("gateways", [])
    cfg.gateways = [
        GatewayConfig(name=g.get("name", ""), ip=g.get("ip", ""))
        for g in gateways_raw
    ]

    cfg.polling_interval_seconds = int(raw.get("polling_interval_seconds", 30))
    cfg.ping_count = int(raw.get("ping_count", 5))
    cfg.ping_timeout_seconds = int(raw.get("ping_timeout_seconds", 3))
    cfg.retention_days = int(raw.get("retention_days", 30))
    cfg.sqlite_path = raw.get("sqlite_path", "/var/lib/n8watch/monitor.db")
    cfg.api_ping_enabled = bool(raw.get("api_ping_enabled", False))

    server_raw = raw.get("server", {})
    cfg.server = ServerConfig(
        host=server_raw.get("host", "0.0.0.0"),
        port=int(server_raw.get("port", 8000)),
    )

    return cfg


_cached_config: Optional[Config] = None


def get_config(path: Optional[str] = None) -> Config:
    """Load and return the configuration. Cached after first load."""
    global _cached_config
    if _cached_config is not None:
        return _cached_config

    if path is None:
        path = os.environ.get(CONFIG_PATH_ENV, DEFAULT_CONFIG_PATH)

    with open(path, "r") as f:
        raw = yaml.safe_load(f)

    raw = _substitute_env_vars(raw) if raw else {}
    _cached_config = _build_config(raw)
    return _cached_config


def reload_config(path: Optional[str] = None) -> Config:
    """Force reload configuration from disk."""
    global _cached_config
    _cached_config = None
    return get_config(path)
