from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import require_teacher
from backend.app.models import User, AuditLog
from backend.app.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit & Compliance"])


@router.get("/records", response_model=List[AuditLogResponse])
def get_audit_records(
    action: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()

