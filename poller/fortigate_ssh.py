"""
FortiGate SSH client using paramiko for interface status and ping execution.
"""
import re
import socket
import time
import logging
from typing import Optional

import paramiko

logger = logging.getLogger(__name__)

_STATS_RE = re.compile(
    r"(\d+)\s+packets?\s+transmitted[,\s]+(\d+)\s+packets?\s+received[,\s]+"
    r"(\d+(?:\.\d+)?)\s*%\s+packet\s+loss",
    re.IGNORECASE,
)
_RTT_RE = re.compile(
    r"round.trip\s+min/avg/max\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)",
    re.IGNORECASE,
)
_ADMIN_STATUS_RE = re.compile(r"^\s*status\s*:\s*(up|down)", re.MULTILINE | re.IGNORECASE)
_LINK_STATUS_RE = re.compile(r"link-status\s*:\s*(up|down|unknown)", re.IGNORECASE)
_PING_WAIT_BUFFER_SECONDS = 5


class FortiGateSSHError(Exception):
    pass


class FortiGateSSH:
    def __init__(
        self,
        host: str,
        port: int = 22,
        username: str = "admin",
        key_file: Optional[str] = None,
        password: Optional[str] = None,
        timeout: int = 10,
        verify_host_key: bool = False,
        known_hosts_file: Optional[str] = None,
    ):
        self.host = host
        self.port = port
        self.username = username
        self.key_file = key_file
        self.password = password
        self.timeout = timeout
        self.verify_host_key = verify_host_key
        self.known_hosts_file = known_hosts_file
        self._client: Optional[paramiko.SSHClient] = None

    def connect(self) -> None:
        """Establish SSH connection with host key verification.

        Host key verification uses RejectPolicy for safety. The FortiGate's SSH
        host key must be present in one of the following locations:
          1. The file specified by ``known_hosts_file`` in config.
          2. The system known_hosts (~/.ssh/known_hosts) when
             ``verify_host_key`` is true.
          3. The default known_hosts files loaded by paramiko when neither
             option is set (falls back to ~/.ssh/known_hosts).

        To add the FortiGate host key to a custom file, run::

            ssh-keyscan -H <fortigate_host> >> /etc/forti-monitor/known_hosts
        """
        client = paramiko.SSHClient()
        if self.known_hosts_file:
            client.load_host_keys(self.known_hosts_file)
        elif self.verify_host_key:
            client.load_system_host_keys()
        else:
            # Attempt to load default system known_hosts so that the
            # RejectPolicy below can match already-trusted host keys.
            try:
                client.load_system_host_keys()
            except OSError:
                pass
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        kwargs = {
            "hostname": self.host,
            "port": self.port,
            "username": self.username,
            "timeout": self.timeout,
            "look_for_keys": False,
            "allow_agent": False,
        }
        if self.key_file:
            kwargs["key_filename"] = self.key_file
        elif self.password:
            kwargs["password"] = self.password

        try:
            client.connect(**kwargs)
            self._client = client
        except (paramiko.SSHException, socket.error) as e:
            raise FortiGateSSHError(f"SSH connect to {self.host}:{self.port} failed: {e}") from e

    def disconnect(self) -> None:
        """Close SSH connection."""
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None

    def _exec(self, command: str) -> str:
        """Execute a single command and return stdout."""
        if self._client is None:
            raise FortiGateSSHError("Not connected")
        try:
            _, stdout, stderr = self._client.exec_command(command, timeout=self.timeout)
            out = stdout.read().decode("utf-8", errors="replace")
            return out
        except (paramiko.SSHException, socket.timeout, socket.error) as e:
            raise FortiGateSSHError(f"Command '{command}' failed: {e}") from e

    def _exec_interactive(self, commands: list, wait_time: float = 2.0) -> str:
        """Execute multiple commands on an interactive shell, return combined output."""
        if self._client is None:
            raise FortiGateSSHError("Not connected")
        try:
            channel = self._client.invoke_shell()
            channel.settimeout(self.timeout)
            # Drain initial banner
            time.sleep(1.0)
            while channel.recv_ready():
                channel.recv(4096)

            for cmd in commands:
                channel.send(cmd + "\n")
                time.sleep(wait_time)

            time.sleep(1.0)
            output = b""
            while channel.recv_ready():
                output += channel.recv(65536)

            channel.close()
            return output.decode("utf-8", errors="replace")
        except (paramiko.SSHException, socket.timeout, socket.error) as e:
            raise FortiGateSSHError(f"Interactive shell commands failed: {e}") from e

    def get_interface_status(self, iface_name: str) -> dict:
        """
        Returns {"admin_up": bool, "link_up": bool, "raw_text": str}
        """
        try:
            self.connect()
            raw_text = self._exec(
                f"get system interface | grep -A 10 '== \\[{iface_name}\\]'"
            )
        except FortiGateSSHError:
            raise
        finally:
            self.disconnect()

        admin_up = False
        link_up = False

        m = _ADMIN_STATUS_RE.search(raw_text)
        if m:
            admin_up = m.group(1).lower() == "up"

        m = _LINK_STATUS_RE.search(raw_text)
        if m:
            link_up = m.group(1).lower() == "up"

        return {
            "admin_up": admin_up,
            "link_up": link_up,
            "raw_text": raw_text,
        }

    def run_ping(
        self,
        target_ip: str,
        count: int = 5,
        timeout: int = 3,
    ) -> dict:
        """
        Run ping via FortiOS execute ping commands.
        Returns dict with success, sent, received, loss_pct, rtt_min_ms,
        rtt_avg_ms, rtt_max_ms, error, raw_text.
        """
        try:
            self.connect()
            commands = [
                f"execute ping-options count {count}",
                f"execute ping-options timeout {timeout}",
                f"execute ping {target_ip}",
            ]
            # Longer wait for ping to complete (count * timeout + buffer)
            raw_text = self._exec_interactive(
                commands,
                wait_time=float(count * timeout + _PING_WAIT_BUFFER_SECONDS),
            )
        except FortiGateSSHError as e:
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
        finally:
            self.disconnect()

        sent = 0
        received = 0
        loss_pct = 100.0
        rtt_min = None
        rtt_avg = None
        rtt_max = None
        error = None

        m = _STATS_RE.search(raw_text)
        if m:
            sent = int(m.group(1))
            received = int(m.group(2))
            loss_pct = float(m.group(3))
        else:
            error = "Could not parse ping statistics"

        m = _RTT_RE.search(raw_text)
        if m:
            rtt_min = float(m.group(1))
            rtt_avg = float(m.group(2))
            rtt_max = float(m.group(3))

        success = received > 0

        return {
            "success": success,
            "sent": sent,
            "received": received,
            "loss_pct": loss_pct,
            "rtt_min_ms": rtt_min,
            "rtt_avg_ms": rtt_avg,
            "rtt_max_ms": rtt_max,
            "error": error,
            "raw_text": raw_text,
        }
