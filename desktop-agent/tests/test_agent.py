import os
import sys
import uuid
import tempfile
import pytest
from datetime import datetime, timezone

# Add desktop-agent to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.common.identity import (
    get_os_type,
    get_os_version,
    get_hostname,
    get_persistent_hardware_uuid,
    get_device_identity,
)
from src.common.event_envelope import (
    create_event_envelope,
    create_heartbeat_envelope,
    create_app_changed_envelope,
    create_restricted_app_envelope,
    create_lifecycle_envelope,
)
from src.common.event_buffer import EventBuffer
from src.common.config import AgentConfig
from src.windows.detector import WindowsDetector
from src.linux.detector import LinuxDetector


def test_identity_generation():
    """Verify hardware identity fields are valid and persistent."""
    identity = get_device_identity()
    assert identity["os_type"] in ["windows", "linux", "macos", "unknown"]
    assert len(identity["hostname"]) > 0
    hw_uuid = identity["hardware_uuid"]
    # Check valid UUID format
    val = uuid.UUID(hw_uuid)
    assert str(val) == hw_uuid

    # Check persistence on subsequent call
    hw_uuid_2 = get_persistent_hardware_uuid()
    assert hw_uuid == hw_uuid_2


def test_event_envelope_structure():
    """Verify event envelope adheres strictly to docs/API_CONTRACT.md."""
    envelope = create_event_envelope(
        event_category="activity_event",
        event_type="foreground_app_changed",
        device_id="dev-test-123",
        student_id="usr-stud-456",
        session_id="sess-789",
        mode="exam",
        severity="low",
        details={"process_name": "calc.exe"},
    )

    assert uuid.UUID(envelope["event_id"])
    assert envelope["type"] == "activity_event"
    assert envelope["event_type"] == "foreground_app_changed"
    assert envelope["source"] == "agent"
    assert envelope["device_id"] == "dev-test-123"
    assert envelope["student_id"] == "usr-stud-456"
    assert envelope["session_id"] == "sess-789"
    assert envelope["mode"] == "exam"
    assert envelope["severity"] == "low"
    assert envelope["details"]["process_name"] == "calc.exe"

    # Timestamp must parse as valid ISO-8601
    dt = datetime.fromisoformat(envelope["occurred_at"])
    assert dt.tzinfo is not None


def test_restricted_app_envelope():
    """Verify high severity and policy details on restricted app alert."""
    envelope = create_restricted_app_envelope(
        device_id="dev-1",
        student_id="usr-1",
        process_name="cheatengine.exe",
    )
    assert envelope["type"] == "alert_event"
    assert envelope["event_type"] == "restricted_app"
    assert envelope["severity"] == "high"
    assert envelope["details"]["process_name"] == "cheatengine.exe"


def test_event_buffer_fifo_and_ack():
    """Test local SQLite buffer queue: FIFO ordering, deduplication, and acknowledgment."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        buffer = EventBuffer(db_path=temp_db, max_size=10)
        assert buffer.count() == 0

        # Enqueue 3 events
        ev1 = create_heartbeat_envelope("d1", "s1")
        ev2 = create_app_changed_envelope("d1", "s1", "notepad.exe")
        ev3 = create_restricted_app_envelope("d1", "s1", "discord.exe")

        assert buffer.enqueue(ev1) is True
        assert buffer.enqueue(ev2) is True
        assert buffer.enqueue(ev3) is True
        assert buffer.count() == 3

        # Deduplication check: re-enqueue ev1
        assert buffer.enqueue(ev1) is True
        assert buffer.count() == 3  # Count unchanged

        # Peek
        peeked = buffer.peek(limit=2)
        assert len(peeked) == 2
        assert peeked[0]["event_id"] == ev1["event_id"]
        assert peeked[1]["event_id"] == ev2["event_id"]

        # Acknowledge ev1
        buffer.acknowledge([ev1["event_id"]])
        assert buffer.count() == 2

        # Peek again
        peeked_after = buffer.peek(limit=5)
        assert len(peeked_after) == 2
        assert peeked_after[0]["event_id"] == ev2["event_id"]
        assert peeked_after[1]["event_id"] == ev3["event_id"]

    finally:
        if os.path.exists(temp_db):
            os.remove(temp_db)


def test_event_buffer_pruning_overflow():
    """Test buffer bounds enforcement when max_size is reached."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        max_limit = 5
        buffer = EventBuffer(db_path=temp_db, max_size=max_limit)

        for i in range(10):
            ev = create_app_changed_envelope("d1", "s1", f"app_{i}.exe")
            buffer.enqueue(ev)

        assert buffer.count() <= max_limit
    finally:
        if os.path.exists(temp_db):
            os.remove(temp_db)


def test_windows_detector_interface():
    """Verify Windows detector behaves safely regardless of host platform."""
    detector = WindowsDetector()
    if sys.platform == "win32":
        assert detector.is_supported is True
        proc, is_restr = detector.get_foreground_process()
        # Should return a string or None, never crash
        assert proc is None or isinstance(proc, str)
        assert isinstance(is_restr, bool)
        assert detector.get_display_count() >= 1
    else:
        assert detector.is_supported is False
        proc, is_restr = detector.get_foreground_process()
        assert proc is None


def test_linux_detector_interface():
    """Verify Linux detector checks session type and doesn't crash on Windows/Wayland."""
    detector = LinuxDetector()
    if sys.platform.startswith("linux"):
        assert detector.is_linux is True
    else:
        assert detector.is_feature_supported() is False
        proc, is_restr = detector.get_foreground_process()
        assert proc is None
