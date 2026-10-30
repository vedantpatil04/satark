import os
import sys
import subprocess
import logging
from typing import Tuple, Optional, List

logger = logging.getLogger("SmartClassroomAgent.LinuxDetector")

DEFAULT_RESTRICTED_LINUX_PROCESSES = {
    "discord",
    "telegram-desktop",
    "whatsapp-for-linux",
    "anydesk",
    "teamviewer",
    "obs",
    "vncviewer",
}


class LinuxDetector:
    def __init__(self, restricted_list: Optional[List[str]] = None):
        self.is_linux = sys.platform.startswith("linux")
        self.session_type = os.environ.get("XDG_SESSION_TYPE", "unknown").lower()
        self.is_wayland = "wayland" in self.session_type
        self.restricted_set = {p.lower() for p in (restricted_list or DEFAULT_RESTRICTED_LINUX_PROCESSES)}

    def is_feature_supported(self) -> bool:
        """
        Wayland security restrictions prevent unprivileged processes from querying
        global foreground windows. X11 with xprop or xdotool is supported.
        """
        if not self.is_linux:
            return False
        if self.is_wayland:
            return False
        # Test if xprop is accessible
        try:
            res = subprocess.run(["which", "xprop"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return res.returncode == 0
        except Exception:
            return False

    def get_foreground_process(self) -> Tuple[Optional[str], bool]:
        """
        Queries the active foreground window process name on X11.
        Gracefully returns (None, False) on Wayland or unsupported environments.
        """
        if not self.is_feature_supported():
            return None, False

        try:
            # Query active window ID on X11
            out = subprocess.check_output(
                ["xprop", "-root", "_NET_ACTIVE_WINDOW"],
                stderr=subprocess.DEVNULL,
                timeout=1,
            ).decode("utf-8")
            parts = out.strip().split()
            if not parts or len(parts) < 5:
                return None, False

            win_id = parts[-1]
            if win_id == "0x0":
                return None, False

            # Query process PID from window ID
            pid_out = subprocess.check_output(
                ["xprop", "-id", win_id, "_NET_WM_PID"],
                stderr=subprocess.DEVNULL,
                timeout=1,
            ).decode("utf-8")
            pid_parts = pid_out.strip().split()
            if not pid_parts or len(pid_parts) < 3:
                return None, False

            pid = int(pid_parts[-1])
            # Read process name from /proc/<pid>/comm
            comm_path = f"/proc/{pid}/comm"
            if os.path.exists(comm_path):
                with open(comm_path, "r") as f:
                    proc_name = f.read().strip().lower()
                    is_restricted = proc_name in self.restricted_set
                    return proc_name, is_restricted

            return None, False

        except Exception as e:
            logger.debug(f"Linux X11 window detection error: {e}")
            return None, False

    def get_display_count(self) -> int:
        """Counts connected displays on Linux via xrandr where available."""
        if not self.is_linux:
            return 1
        try:
            out = subprocess.check_output(["xrandr", "--listmonitors"], stderr=subprocess.DEVNULL, timeout=1).decode()
            for line in out.splitlines():
                if "monitors:" in line.lower():
                    return int(line.split()[-1])
        except Exception:
            pass
        return 1

