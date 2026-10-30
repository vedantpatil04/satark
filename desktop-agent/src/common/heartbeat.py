import asyncio
import logging
from typing import Optional, Dict, Any
import psutil
from .config import AgentConfig
from .api_client import ApiClient
from .websocket_client import AgentWebSocketClient

logger = logging.getLogger("SmartClassroomAgent.Heartbeat")


class HeartbeatManager:
    def __init__(
        self,
        config: AgentConfig,
        api_client: ApiClient,
        ws_client: AgentWebSocketClient,
    ):
        self.config = config
        self.api_client = api_client
        self.ws_client = ws_client
        self.is_running = False
        self._task: Optional[asyncio.Task] = None

    def _collect_device_health(self) -> Dict[str, Any]:
        """Collects lightweight hardware telemetry without invasive inspection."""
        try:
            battery = psutil.sensors_battery()
            return {
                "cpu_percent": psutil.cpu_percent(interval=None),
                "memory_percent": psutil.virtual_memory().percent,
                "battery_percent": round(battery.percent, 1) if battery else None,
                "battery_charging": battery.power_plugged if battery else None,
            }
        except Exception:
            return {}

    async def start(self):
        self.is_running = True
        logger.info(f"Heartbeat loop started (interval: {self.config.heartbeat_interval}s)")

        while self.is_running:
            try:
                health = self._collect_device_health()
                if self.ws_client.is_connected:
                    logger.debug(f"Transmitting heartbeat via WebSocket (CPU: {health.get('cpu_percent')}%, RAM: {health.get('memory_percent')}%)")
                    self.ws_client.send_heartbeat(health=health)
                else:
                    logger.debug("Transmitting heartbeat via REST fallback")
                    self.api_client.send_heartbeat(health=health)
            except Exception as e:
                logger.warning(f"Error during heartbeat transmission: {e}")

            await asyncio.sleep(self.config.heartbeat_interval)

    def stop(self):
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()

