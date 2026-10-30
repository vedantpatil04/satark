import logging
import requests
from typing import Dict, Any, List, Optional
from .config import AgentConfig

logger = logging.getLogger("SmartClassroomAgent.ApiClient")


class ApiClient:
    def __init__(self, config: AgentConfig):
        self.config = config

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.device_token:
            headers["Authorization"] = f"Bearer {self.config.device_token}"
        return headers

    def request_ws_ticket(self) -> Optional[str]:
        """
        Exchanges the persistent device_token for a single-use 60s WebSocket ticket.
        """
        if not self.config.device_token:
            logger.error("Cannot request WS ticket: device is not paired")
            return None

        url = f"{self.config.backend_url}/api/v1/devices/ws-ticket"
        try:
            resp = requests.post(url, headers=self._get_headers(), timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("ticket")
            else:
                logger.warning(f"Failed to obtain WS ticket: HTTP {resp.status_code} - {resp.text}")
                return None
        except requests.exceptions.RequestException as e:
            logger.warning(f"Network error requesting WS ticket: {e}")
            return None

    def send_heartbeat(self, health: Optional[Dict[str, Any]] = None) -> bool:
        """
        Sends an HTTP heartbeat fallback to the backend with optional hardware telemetry.
        """
        if not self.config.device_id:
            return False

        url = f"{self.config.backend_url}/api/v1/devices/{self.config.device_id}/heartbeat"
        payload: Dict[str, Any] = {"agent_version": self.config.agent_version}
        if health:
            payload["details"] = health

        try:
            resp = requests.post(url, json=payload, headers=self._get_headers(), timeout=8)
            if resp.status_code == 200:
                logger.debug("REST Heartbeat acknowledged by backend")
                return True
            logger.warning(f"REST Heartbeat rejected: HTTP {resp.status_code}")
            return False
        except requests.exceptions.RequestException as e:
            logger.warning(f"Heartbeat network transmission failed: {e}")
            return False

    def send_events_batch(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Submits a batch of event envelopes via HTTP REST.
        Returns response dict: { received, persisted, duplicates_skipped, alerts_triggered }
        """
        if not events:
            return {"received": 0, "persisted": 0, "duplicates_skipped": 0, "alerts_triggered": 0}

        url = f"{self.config.backend_url}/api/v1/devices/events"
        payload = {"events": events}

        try:
            resp = requests.post(url, json=payload, headers=self._get_headers(), timeout=10)
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.error(f"Event batch submission failed: HTTP {resp.status_code} - {resp.text}")
                raise ConnectionError(f"HTTP {resp.status_code}: {resp.text}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Event batch network transmission error: {e}")
            raise ConnectionError(str(e))

