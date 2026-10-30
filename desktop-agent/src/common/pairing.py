import logging
import requests
from typing import Dict, Any, Optional
from .identity import get_device_identity
from .config import AgentConfig

logger = logging.getLogger("SmartClassroomAgent.Pairing")


def pair_device(config: AgentConfig, pairing_code: str) -> Dict[str, Any]:
    """
    Exchanges a single-use pairing code with the backend to associate the device
    with the student and receive a device-scoped token.
    """
    cleaned_code = pairing_code.strip().upper()
    if not cleaned_code:
        raise ValueError("Pairing code cannot be empty")

    identity = get_device_identity()
    endpoint = f"{config.backend_url}/api/v1/devices/pair"

    payload = {
        "pairing_code": cleaned_code,
        "hardware_uuid": identity["hardware_uuid"],
        "hostname": identity["hostname"],
        "os_type": identity["os_type"],
        "os_version": identity["os_version"],
        "agent_version": config.agent_version,
    }

    try:
        logger.info(f"Submitting pairing code to {endpoint}...")
        resp = requests.post(endpoint, json=payload, timeout=10)

        if resp.status_code == 200:
            data = resp.json()
            config.save(data)
            logger.info(f"Successfully paired device with student: {data.get('student_name')}")
            return data
        else:
            err_msg = "Pairing failed"
            try:
                err_json = resp.json()
                err_msg = err_json.get("detail", err_msg)
            except Exception:
                err_msg = f"HTTP {resp.status_code}: {resp.text}"
            logger.error(f"Pairing rejected: {err_msg}")
            raise ValueError(err_msg)

    except requests.exceptions.RequestException as e:
        logger.error(f"Network error during device pairing: {e}")
        raise ConnectionError(f"Unable to reach backend at {config.backend_url}: {e}")

