import os
import sys
import uuid
import socket
import platform
import logging
from typing import Dict, Any

logger = logging.getLogger("SmartClassroomAgent.Identity")


def get_os_type() -> str:
    """Returns normalized OS type: 'windows', 'linux', 'macos'."""
    system = platform.system().lower()
    if "windows" in system:
        return "windows"
    elif "linux" in system:
        return "linux"
    elif "darwin" in system:
        return "macos"
    return "unknown"


def get_os_version() -> str:
    """Returns formatted OS release details."""
    try:
        return f"{platform.system()} {platform.release()} ({platform.version()})"
    except Exception:
        return platform.release() or "unknown"


def get_hostname() -> str:
    """Returns workstation network hostname."""
    try:
        return socket.gethostname()
    except Exception:
        return "unknown-host"


def get_persistent_hardware_uuid() -> str:
    """
    Retrieves or generates a persistent, unique hardware identifier for the device.
    1. Checks cached identifier in local hidden file.
    2. Reads Windows registry MachineGuid (on Windows).
    3. Reads /etc/machine-id or /var/lib/dbus/machine-id (on Linux).
    4. Fallback to stable SHA256/UUID of MAC address + platform info.
    """
    cache_file = os.path.join(os.path.expanduser("~"), ".smart_classroom_device_uuid")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                val = f.read().strip()
                if val:
                    return str(uuid.UUID(val))
        except Exception:
            pass

    found_uuid = None
    os_type = get_os_type()

    if os_type == "windows":
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography")
            guid, _ = winreg.QueryValueEx(key, "MachineGuid")
            winreg.CloseKey(key)
            if guid:
                found_uuid = str(uuid.UUID(guid))
        except Exception as e:
            logger.debug(f"Could not read Windows MachineGuid: {e}")

    elif os_type == "linux":
        for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        mid = f.read().strip()
                        if mid:
                            found_uuid = str(uuid.UUID(mid))
                            break
                except Exception:
                    pass

    # Generic fallback using stable hardware MAC
    if not found_uuid:
        raw_node = uuid.getnode()
        found_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{get_hostname()}-{raw_node}-{platform.node()}"))

    # Cache locally
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(found_uuid)
    except Exception as e:
        logger.debug(f"Could not cache hardware UUID to disk: {e}")

    return found_uuid


def get_device_identity() -> Dict[str, Any]:
    """Returns complete device identity dictionary."""
    return {
        "hardware_uuid": get_persistent_hardware_uuid(),
        "hostname": get_hostname(),
        "os_type": get_os_type(),
        "os_version": get_os_version(),
    }

