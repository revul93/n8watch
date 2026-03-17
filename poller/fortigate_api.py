"""
FortiGate REST API client using the FortiOS REST API.
"""
import json
import requests
from requests.exceptions import RequestException


class FortiGateAPIError(Exception):
    pass


class FortiGateAPI:
    def __init__(
        self,
        host: str,
        api_token: str,
        verify_ssl: bool = False,
        timeout: int = 10,
    ):
        self.host = host.rstrip("/")
        self.api_token = api_token
        self.verify_ssl = verify_ssl
        self.timeout = timeout

        if not verify_ssl:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _url(self, path: str) -> str:
        return f"https://{self.host}{path}"

    def get_interface_status(self, iface_name: str) -> dict:
        """
        Returns {"admin_up": bool, "link_up": bool, "raw_json": str}
        Raises FortiGateAPIError on failure.
        """
        url = self._url(f"/api/v2/cmdb/system/interface/{iface_name}")
        params = {"access_token": self.api_token}

        try:
            resp = requests.get(
                url,
                params=params,
                verify=self.verify_ssl,
                timeout=self.timeout,
            )
            resp.raise_for_status()
        except RequestException as e:
            raise FortiGateAPIError(f"Request failed for {iface_name}: {e}") from e

        try:
            body = resp.json()
        except ValueError as e:
            raise FortiGateAPIError(f"Invalid JSON response for {iface_name}: {e}") from e

        results = body.get("results")
        if not results or not isinstance(results, list) or len(results) == 0:
            raise FortiGateAPIError(
                f"No results in response for {iface_name}: {body.get('http_status')}"
            )

        data = results[0]
        admin_up = str(data.get("status", "")).lower() == "up"
        link_status = str(data.get("link-status", data.get("link_status", "unknown"))).lower()
        link_up = link_status == "up"

        return {
            "admin_up": admin_up,
            "link_up": link_up,
            "raw_json": json.dumps(data),
        }
