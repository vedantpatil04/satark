from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import require_teacher
from backend.app.models import User, Alert
from backend.app.schemas import AlertResponse, AlertAcknowledgeRequest
from backend.app.services.audit_service import log_action

router = APIRouter(prefix="/alerts", tags=["Alerts & Integrity"])


@router.get("", response_model=List[AlertResponse])
def list_alerts(
    session_id: Optional[str] = Query(None),
    is_acknowledged: Optional[bool] = Query(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    query = db.query(Alert)
    if session_id:
        query = query.filter(Alert.session_id == session_id)
    if is_acknowledged is not None:
        query = query.filter(Alert.is_acknowledged == is_acknowledged)

    return query.order_by(Alert.created_at.desc()).all()


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(
    alert_id: str,
    req: AlertAcknowledgeRequest,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    alert.is_acknowledged = True
    alert.acknowledged_by = current_user.id
    alert.acknowledged_at = datetime.now(timezone.utc)
    if req.proctor_notes:
        alert.proctor_notes = req.proctor_notes
    db.commit()
    db.refresh(alert)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="ALERT_ACKNOWLEDGED",
        actor_user_id=current_user.id,
        target_resource=alert.id,
        ip_address=client_ip,
        details={"alert_type": alert.alert_type, "proctor_notes": alert.proctor_notes}
    )

    return alert

