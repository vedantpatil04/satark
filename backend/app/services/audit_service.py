import json
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from backend.app.models import AuditLog


def log_action(
    db: Session,
    action: str,
    actor_user_id: Optional[str] = None,
    target_resource: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """
    Creates an immutable audit record for administrative and security actions.
    Never logs passwords or sensitive credentials.
    """
    safe_details = details.copy() if details else {}
    # Strip any accidental secrets
    for secret_key in ["password", "token", "secret", "hashed_password", "key"]:
        safe_details.pop(secret_key, None)

    # Normalize any non-JSON native types (e.g. UUID, datetime) safely
    if safe_details:
        safe_details = json.loads(json.dumps(safe_details, default=str))

    audit_entry = AuditLog(
        actor_user_id=str(actor_user_id) if actor_user_id else None,
        action=action,
        target_resource=str(target_resource) if target_resource else None,
        ip_address=ip_address,
        details=safe_details
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry

