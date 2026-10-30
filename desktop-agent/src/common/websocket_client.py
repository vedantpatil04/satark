import asyncio
import json
import logging
from typing import Optional, Callable, Dict, Any
import websockets
from .config import AgentConfig
from .api_client import ApiClient

logger = logging.getLogger("SmartClassroomAgent.WebSocketClient")


class AgentWebSocketClient:
    def __init__(
        self,
        config: AgentConfig,
        api_client: ApiClient,
        on_connected: Optional[Callable[[], None]] = None,
        on_disconnected: Optional[Callable[[], None]] = None,
        on_ack: Optional[Callable[[str], None]] = None,
    ):
        self.config = config
        self.api_client = api_client
        self.on_connected = on_connected
        self.on_disconnected = on_disconnected
        self.on_ack = on_ack

        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False
        self.is_connected = False
        self._send_queue: asyncio.Queue = asyncio.Queue()

    def _get_ws_url(self, ticket: str) -> str:
        base = self.config.backend_url
        if base.startswith("https://"):
            ws_base = "wss://" + base[8:]
        elif base.startswith("http://"):
            ws_base = "ws://" + base[7:]
        else:
            ws_base = f"ws://{base}"
        return f"{ws_base}/ws/agent?ticket={ticket}"

    async def start(self):
        self.is_running = True
        retry_delay = 1

        while self.is_running:
            try:
                # 1. Fetch short-lived ticket
                ticket = self.api_client.request_ws_ticket()
                if not ticket:
                    logger.warning("Could not acquire WS ticket. Retrying in %ss...", retry_delay)
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 30)
                    continue

                ws_url = self._get_ws_url(ticket)
                logger.info(f"Connecting to WebSocket at {ws_url.split('?')[0]}...")

                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                    self.ws = ws
                    self.is_connected = True
                    retry_delay = 1
                    logger.info("Real-time WebSocket connection established with backend")

                    if self.on_connected:
                        self.on_connected()

                    # Run reader and writer concurrently
                    consumer_task = asyncio.create_task(self._read_messages())
                    producer_task = asyncio.create_task(self._write_messages())

                    done, pending = await asyncio.wait(
                        [consumer_task, producer_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )

                    for task in pending:
                        task.cancel()

            except (websockets.exceptions.ConnectionClosed, ConnectionError, OSError) as e:
                logger.warning(f"WebSocket disconnected ({e}). Retrying in {retry_delay}s...")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected WebSocket error: {e}")
            finally:
                self.is_connected = False
                self.ws = None
                if self.on_disconnected:
                    self.on_disconnected()

            if self.is_running:
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 30)

    async def _read_messages(self):
        """Listens for acknowledgments and heartbeat responses from server."""
        while self.is_running and self.ws:
            try:
                raw = await self.ws.recv()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "ack":
                    event_id = msg.get("event_id")
                    if event_id and self.on_ack:
                        self.on_ack(event_id)
                elif msg_type == "heartbeat_ack":
                    logger.debug("Received heartbeat acknowledgment from backend")
                elif msg_type == "pong":
                    logger.debug("Received pong")

            except Exception as e:
                logger.debug(f"Error reading message from WebSocket: {e}")
                break

    async def _write_messages(self):
        """Drains outbound queue to backend WebSocket."""
        while self.is_running and self.ws:
            try:
                msg = await self._send_queue.get()
                await self.ws.send(json.dumps(msg))
                self._send_queue.task_done()
            except Exception as e:
                logger.debug(f"Error writing to WebSocket: {e}")
                break

    def send_envelope(self, envelope: Dict[str, Any]):
        """Queues an event envelope for transmission."""
        self._send_queue.put_nowait({
            "type": "event_envelope",
            "envelope": envelope,
        })

    def send_heartbeat(self, health: Optional[Dict[str, Any]] = None):
        """Queues a heartbeat frame with optional health metrics."""
        payload: Dict[str, Any] = {
            "type": "heartbeat",
            "device_id": self.config.device_id,
        }
        if health:
            payload["health"] = health
        self._send_queue.put_nowait(payload)

    async def stop(self):
        self.is_running = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass

