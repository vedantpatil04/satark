import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Literal

VALID_CATEGORIES = ("activity_event", "heartbeat", "connectivity_event", "session_event", "alert_event")
VALID_SEVERITIES = ("low", "medium", "high", "critical")
VALID_MODES = ("exam", "focus")


def create_event_envelope(
    event_category: str,
    event_type: str,
    device_id: str,
    student_id: str,
    session_id: str = "active-device-session",
    mode: str = "exam",
    classroom_id: Optional[str] = None,
    severity: str = "low",
    details: Optional[Dict[str, Any]] = None,
    occurred_at: Optional[datetime] = None,
    event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Constructs a validated unified event envelope conforming strictly to docs/API_CONTRACT.md.
    """
    if event_category not in VALID_CATEGORIES:
        event_category = "activity_event"

    if severity not in VALID_SEVERITIES:
        severity = "low"

    if mode not in VALID_MODES:
        mode = "exam"

    now_utc = occurred_at or datetime.now(timezone.utc)
    # Ensure ISO-8601 formatting with Z or +00:00
    iso_time = now_utc.astimezone(timezone.utc).isoformat()

    return {
        "event_id": event_id or str(uuid.uuid4()),
        "type": event_category,
        "event_type": event_type,
        "device_id": device_id,
        "student_id": student_id,
        "classroom_id": classroom_id,
        "session_id": session_id,
        "mode": mode,
        "occurred_at": iso_time,
        "source": "agent",
        "severity": severity,
        "details": details or {},
    }


def create_heartbeat_envelope(device_id: str, student_id: str, session_id: str = "active-device-session") -> Dict[str, Any]:
    return create_event_envelope(
        event_category="heartbeat",
        event_type="heartbeat",
        device_id=device_id,
        student_id=student_id,
        session_id=session_id,
        severity="low",
        details={"status": "alive"},
    )


def create_app_changed_envelope(
    device_id: str,
    student_id: str,
    process_name: str,
    session_id: str = "active-device-session",
    mode: str = "exam",
) -> Dict[str, Any]:
    return create_event_envelope(
        event_category="activity_event",
        event_type="foreground_app_changed",
        device_id=device_id,
        student_id=student_id,
        session_id=session_id,
        mode=mode,
        severity="low",
        details={"process_name": process_name},
    )


def create_restricted_app_envelope(
    device_id: str,
    student_id: str,
    process_name: str,
    rule_name: str = "Restricted Process Policy",
    session_id: str = "active-device-session",
    mode: str = "exam",
) -> Dict[str, Any]:
    return create_event_envelope(
        event_category="alert_event",
        event_type="restricted_app",
        device_id=device_id,
        student_id=student_id,
        session_id=session_id,
        mode=mode,
        severity="high",
        details={
            "process_name": process_name,
            "rule": rule_name,
            "reason": f"Disallowed application '{process_name}' detected in foreground",
        },
    )


def create_lifecycle_envelope(
    device_id: str,
    student_id: str,
    lifecycle_type: str,  # 'agent_started', 'agent_stopped'
    session_id: str = "active-device-session",
    mode: str = "exam",
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return create_event_envelope(
        event_category="session_event",
        event_type=lifecycle_type,
        device_id=device_id,
        student_id=student_id,
        session_id=session_id,
        mode=mode,
        severity="low",
        details=details or {},
    )

