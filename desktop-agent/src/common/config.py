import os
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("SmartClassroomAgent.Config")


class AgentConfig:
    def __init__(self, config_path: str = "agent_config.json"):
        self.config_path = os.path.abspath(config_path)
        self.backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
        self.heartbeat_interval = int(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "10"))
        self.buffer_db_path = os.environ.get("BUFFER_DB_PATH", "agent_buffer.db")
        self.max_buffer_size = int(os.environ.get("EVENT_BUFFER_MAX_SIZE", "500"))
        self.agent_version = "1.0.0"

        # Paired device state
        self.device_id: Optional[str] = None
        self.device_token: Optional[str] = None
        self.student_id: Optional[str] = None
        self.student_name: Optional[str] = None
        self.hardware_uuid: Optional[str] = None

        self.load()

    def is_paired(self) -> bool:
        return bool(self.device_id and self.device_token)

    def load(self) -> bool:
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.device_id = data.get("device_id")
                    self.device_token = data.get("device_token")
                    self.student_id = data.get("student_id")
                    self.student_name = data.get("student_name")
                    self.hardware_uuid = data.get("hardware_uuid")
                    if "backend_url" in data and not os.environ.get("BACKEND_URL"):
                        self.backend_url = data["backend_url"].rstrip("/")
                    return True
            except Exception as e:
                logger.warning(f"Could not read config file {self.config_path}: {e}")
        return False

    def save(self, data: Dict[str, Any]):
        self.device_id = data.get("device_id", self.device_id)
        self.device_token = data.get("device_token", self.device_token)
        self.student_id = data.get("student_id", self.student_id)
        self.student_name = data.get("student_name", self.student_name)
        self.hardware_uuid = data.get("hardware_uuid", self.hardware_uuid)

        payload = {
            "device_id": self.device_id,
            "device_token": self.device_token,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "hardware_uuid": self.hardware_uuid,
            "backend_url": self.backend_url,
            "agent_version": self.agent_version,
        }

        try:
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            logger.info(f"Agent configuration saved to {self.config_path}")
        except Exception as e:
            logger.error(f"Failed to save config to {self.config_path}: {e}")

    def reset_pairing(self):
        self.device_id = None
        self.device_token = None
        self.student_id = None
        self.student_name = None
        if os.path.exists(self.config_path):
            try:
                os.remove(self.config_path)
            except Exception as e:
                logger.warning(f"Could not remove config file: {e}")

