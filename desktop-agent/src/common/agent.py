import asyncio
import sys
import logging
from typing import Optional
from .config import AgentConfig
from .api_client import ApiClient
from .event_buffer import EventBuffer
from .websocket_client import AgentWebSocketClient
from .heartbeat import HeartbeatManager
from .event_envelope import (
    create_app_changed_envelope,
    create_restricted_app_envelope,
    create_lifecycle_envelope,
)
from ..windows.detector import WindowsDetector
from ..linux.detector import LinuxDetector

logger = logging.getLogger("SmartClassroomAgent.Core")


class DesktopAgent:
    def __init__(self, config: AgentConfig):
        self.config = config
        self.api_client = ApiClient(config)
        self.buffer = EventBuffer(db_path=config.buffer_db_path, max_size=config.max_buffer_size)

        # Platform detector initialization
        self.os_type = "windows" if sys.platform == "win32" else "linux" if sys.platform.startswith("linux") else "other"
        if self.os_type == "windows":
            self.detector = WindowsDetector()
        elif self.os_type == "linux":
            self.detector = LinuxDetector()
        else:
            self.detector = None

        self.last_process_name: Optional[str] = None
        self.is_running = False

        # WebSocket client with ACK callback
        self.ws_client = AgentWebSocketClient(
            config=config,
            api_client=self.api_client,
            on_connected=self._on_ws_connected,
            on_disconnected=self._on_ws_disconnected,
            on_ack=self._on_event_ack,
        )

        # Heartbeat manager
        self.heartbeat_mgr = HeartbeatManager(
            config=config,
            api_client=self.api_client,
            ws_client=self.ws_client,
        )

    def _on_ws_connected(self):
        logger.info("Real-time telemetry uplink established. Draining event queue...")
        asyncio.create_task(self.drain_buffer())

    def _on_ws_disconnected(self):
        logger.warning("Telemetry uplink offline. Switching to local queue buffering.")

    def _on_event_ack(self, event_id: str):
        logger.debug(f"Event acknowledged by backend: {event_id}")
        self.buffer.acknowledge([event_id])

    async def start(self):
        self.is_running = True
        logger.info(f"Initializing Desktop Agent on {self.os_type}...")

        # 1. Emit agent_started event
        start_event = create_lifecycle_envelope(
            device_id=self.config.device_id,
            student_id=self.config.student_id,
            lifecycle_type="agent_started",
            details={
                "os_type": self.os_type,
                "agent_version": self.config.agent_version,
                "detector_supported": self.detector.is_feature_supported() if self.detector else False,
            },
        )
        self.buffer.enqueue(start_event)

        # 2. Launch concurrent loops
        ws_task = asyncio.create_task(self.ws_client.start())
        hb_task = asyncio.create_task(self.heartbeat_mgr.start())
        detector_task = asyncio.create_task(self._detection_loop())
        drain_task = asyncio.create_task(self._periodic_drain_loop())

        try:
            await asyncio.gather(ws_task, hb_task, detector_task, drain_task)
        except asyncio.CancelledError:
            pass
        finally:
            await self.shutdown()

    async def _detection_loop(self):
        """Monitors active workstation applications and policies with debouncing."""
        logger.info("Application activity detector active")
        supported = self.detector.is_feature_supported() if self.detector else False
        if not supported:
            logger.info(f"Foreground window detection is unsupported on this display session ({self.os_type}). Heartbeats remain operational.")

        while self.is_running:
            try:
                if self.detector and supported:
                    proc_name, is_restricted = self.detector.get_foreground_process()

                    if proc_name and proc_name != self.last_process_name:
                        self.last_process_name = proc_name
                        logger.info(f"Active application changed: {proc_name}")

                        # Check for restricted app breach
                        if is_restricted:
                            logger.warning(f"Restricted application detected: {proc_name}")
                            breach_event = create_restricted_app_envelope(
                                device_id=self.config.device_id,
                                student_id=self.config.student_id,
                                process_name=proc_name,
                            )
                            self.buffer.enqueue(breach_event)
                        else:
                            # Standard application transition
                            app_event = create_app_changed_envelope(
                                device_id=self.config.device_id,
                                student_id=self.config.student_id,
                                process_name=proc_name,
                            )
                            self.buffer.enqueue(app_event)

                        await self.drain_buffer()

            except Exception as e:
                logger.debug(f"Detector loop iteration error: {e}")

            await asyncio.sleep(2.5)

    async def _periodic_drain_loop(self):
        """Periodically flushes any buffered events every 5 seconds."""
        while self.is_running:
            await asyncio.sleep(5)
            await self.drain_buffer()

    async def drain_buffer(self):
        """Transmits pending buffered events via WebSocket or HTTP REST fallback."""
        pending = self.buffer.peek(limit=25)
        if not pending:
            return

        if self.ws_client.is_connected:
            for env in pending:
                self.ws_client.send_envelope(env)
        else:
            # Fallback to HTTP REST batch
            try:
                result = self.api_client.send_events_batch(pending)
                if result.get("received", 0) > 0:
                    event_ids = [e["event_id"] for e in pending]
                    self.buffer.acknowledge(event_ids)
            except Exception as e:
                logger.debug(f"REST batch drain delayed: {e}")

    async def shutdown(self):
        logger.info("Initiating clean agent shutdown...")
        self.is_running = False

        # Emit agent_stopped
        try:
            stop_event = create_lifecycle_envelope(
                device_id=self.config.device_id,
                student_id=self.config.student_id,
                lifecycle_type="agent_stopped",
                details={"reason": "user_exit"},
            )
            # Try immediate REST transmission
            self.api_client.send_events_batch([stop_event])
        except Exception:
            pass

        self.heartbeat_mgr.stop()
        await self.ws_client.stop()
        logger.info("Agent shutdown complete. Goodbye!")

