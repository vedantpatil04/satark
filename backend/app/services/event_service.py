from datetime import datetime, timezone
from typing import Tuple, Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from backend.app.schemas import EventEnvelope
from backend.app.models import ActivityEvent, Device, Alert
from backend.app.services.rule_engine import evaluate_event_rules


def ingest_event_envelope(
    db: Session,
    envelope: EventEnvelope,
    raise_on_duplicate: bool = True
) -> Tuple[Optional[ActivityEvent], bool, Optional[Alert]]:
    """
    Ingests, validates, and persists a unified event envelope.
    Enforces deduplication on event_id.
    Updates device status.
    Executes rule engine.
    """
    # 1. Deduplication check
    existing = db.query(ActivityEvent).filter(ActivityEvent.id == envelope.event_id).first()
    if existing:
        if raise_on_duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate event_id rejected: {envelope.event_id}"
            )
        return existing, False, None

    # 2. Update device status if device exists
    if envelope.device_id:
        device = db.query(Device).filter(Device.id == envelope.device_id).first()
        if device:
            device.last_heartbeat_at = datetime.now(timezone.utc)
            device.status = "connected"
            db.add(device)

    # 3. Persist Event
    event_model = ActivityEvent(
        id=envelope.event_id,
        device_id=envelope.device_id,
        student_id=envelope.student_id,
        classroom_id=envelope.classroom_id,
        session_id=envelope.session_id,
        mode=envelope.mode,
        event_category=envelope.type,
        event_type=envelope.event_type,
        source=envelope.source,
        severity=envelope.severity,
        occurred_at=envelope.occurred_at,
        details=envelope.details
    )
    db.add(event_model)
    db.commit()
    db.refresh(event_model)

    # 4. Evaluate Rules (generates Alert for Exam or Nudge for Focus)
    alert = evaluate_event_rules(db, event_model)

    return event_model, True, alert

