import uuid
from typing import Optional
from sqlalchemy.orm import Session
from backend.app.models import ActivityEvent, Alert, Notification, ExamSession


def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def evaluate_event_rules(db: Session, event: ActivityEvent) -> Optional[Alert]:
    """
    Evaluates an ingested event envelope against policy rules.
    - Exam Mode: Generates explainable, evidence-backed Alerts for teacher review.
    - Focus Mode: Emits gentle, non-punitive focus reminders.
    """
    if event.mode == "exam":
        if not _is_uuid(event.session_id):
            return None
        # Look up active exam session
        exam = db.query(ExamSession).filter(ExamSession.id == str(event.session_id)).first()
        policy = exam.policy_config if exam and exam.policy_config else {}

        # Default rules if not explicitly set
        violation_types = [
            "window_blur",
            "tab_switch",
            "fullscreen_exit",
            "restricted_app",
            "restricted_website",
            "multi_display_detected",
            "multiple_faces"
        ]

        if event.event_type in violation_types:
            # Fairness Control: Check duplicate alert suppression (last 5 seconds)
            recent_alert = db.query(Alert).filter(
                Alert.session_id == event.session_id,
                Alert.student_id == event.student_id,
                Alert.alert_type == event.event_type
            ).order_by(Alert.created_at.desc()).first()

            if recent_alert:
                delta_sec = (event.occurred_at - recent_alert.created_at).total_seconds()
                if abs(delta_sec) < 5.0:
                    # Suppress rapid duplicate alerts within 5s grace window
                    return None

            incident_count = db.query(ActivityEvent).filter(
                ActivityEvent.session_id == event.session_id,
                ActivityEvent.student_id == event.student_id,
                ActivityEvent.event_type == event.event_type
            ).count()

            if event.event_type == "tab_switch":
                severity = "high" if incident_count >= 3 else "medium"
                description = f"Browser Tab-Switch Detected (Incident #{incident_count}) - Page hidden on student client."
            elif event.event_type == "fullscreen_exit":
                severity = "medium"
                description = f"Fullscreen Mode Exited (Incident #{incident_count}) - Student exited exam viewport."
            elif event.event_type == "multi_display_detected":
                severity = "critical"
                description = "Integrity Rule Trigger: Multi Display Detected"
            elif event.event_type in ["restricted_app", "restricted_website"]:
                severity = "high"
                description = f"Integrity Rule Trigger: {event.event_type.replace('_', ' ').title()}"
                if "process_name" in event.details:
                    description += f" (Process: {event.details.get('process_name')})"
                elif "restricted_domain" in event.details:
                    description += f" (Domain: {event.details.get('restricted_domain')})"
                elif "url_or_domain" in event.details:
                    description += f" (Domain: {event.details.get('url_or_domain')})"
            else:
                severity = event.severity or "medium"
                description = f"Integrity Rule Trigger: {event.event_type.replace('_', ' ').title()}"

            alert = Alert(
                session_id=event.session_id,
                student_id=event.student_id,
                device_id=event.device_id,
                primary_event_id=event.id,
                alert_type=event.event_type,
                severity=severity,
                description=description,
                evidence_summary={
                    "occurred_at": event.occurred_at.isoformat(),
                    "source": event.source,
                    "incident_count": incident_count,
                    "tab_switch_count": incident_count if event.event_type == "tab_switch" else None,
                    "details": event.details
                }
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            return alert

    elif event.mode == "focus":
        # In focus mode: emit gentle nudge for student
        if event.event_type in ["restricted_website", "window_blur", "idle_timeout"]:
            notification = Notification(
                user_id=event.student_id,
                title="Gentle Focus Reminder",
                message=f"Notice: attention shifted ({event.event_type.replace('_', ' ')}). Take a breath and return to your focus goal.",
                notification_type="focus_nudge"
            )
            db.add(notification)
            db.commit()

    return None

