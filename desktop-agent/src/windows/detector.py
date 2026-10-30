import os
import sys
import logging
from typing import Tuple, Optional, List
import psutil

logger = logging.getLogger("SmartClassroomAgent.WindowsDetector")

DEFAULT_RESTRICTED_PROCESSES = {
    "discord.exe",
    "telegram.exe",
    "whatsapp.exe",
    "anydesk.exe",
    "teamviewer.exe",
    "cheatengine.exe",
    "obs64.exe",
    "vncviewer.exe",
}


class WindowsDetector:
    def __init__(self, restricted_list: Optional[List[str]] = None):
        self.is_supported = sys.platform == "win32"
        self.restricted_set = {p.lower() for p in (restricted_list or DEFAULT_RESTRICTED_PROCESSES)}
        self._user32 = None
        self._kernel32 = None

        if self.is_supported:
            try:
                import ctypes
                self._user32 = ctypes.windll.user32
                self._kernel32 = ctypes.windll.kernel32
            except Exception as e:
                logger.warning(f"Failed to bind ctypes user32 on Windows: {e}")

    def get_foreground_process(self) -> Tuple[Optional[str], bool]:
        """
        Returns (process_name, is_restricted).
        Complies strictly with privacy guidelines: no keystrokes, no document content,
        only the operating system executable process name.
        """
        if not self.is_supported or not self._user32:
            return None, False

        try:
            import ctypes
            hwnd = self._user32.GetForegroundWindow()
            if not hwnd:
                return None, False

            pid = ctypes.c_ulong()
            self._user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value <= 0:
                return None, False

            process = psutil.Process(pid.value)
            proc_name = process.name().lower()

            is_restricted = proc_name in self.restricted_set
            return proc_name, is_restricted

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None, False
        except Exception as e:
            logger.debug(f"Error querying Windows foreground window: {e}")
            return None, False

    def get_display_count(self) -> int:
        """
        Returns number of physical monitors detected on Windows (SM_CMONITORS = 80).
        """
        if not self.is_supported or not self._user32:
            return 1
        try:
            return max(1, self._user32.GetSystemMetrics(80))
        except Exception:
            return 1

    def is_feature_supported(self) -> bool:
        return self.is_supported and self._user32 is not None

