from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.models import User, FocusSession
from backend.app.schemas import (
    FocusSessionCreate, FocusSessionResponse, FocusSessionActionRequest,
    FocusAnalyticsResponse, FocusDailyTrend
)
from backend.app.services.audit_service import log_action

router = APIRouter(prefix="/focus", tags=["Focus Mode"])


@router.post("/sessions", response_model=FocusSessionResponse, status_code=status.HTTP_201_CREATED)
def start_focus_session(
    req: FocusSessionCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only students can start personal focus sessions")

    session = FocusSession(
        student_id=current_user.id,
        classroom_id=req.classroom_id,
        goal_title=req.goal_title.strip(),
        planned_duration_minutes=req.planned_duration_minutes,
        actual_focus_seconds=0,
        actual_break_seconds=0,
        status="active"
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="FOCUS_SESSION_STARTED",
        actor_user_id=current_user.id,
        target_resource=session.id,
        ip_address=client_ip,
        details={"goal_title": session.goal_title, "planned_minutes": session.planned_duration_minutes}
    )

    return session


@router.get("/sessions", response_model=List[FocusSessionResponse])
def list_focus_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "teacher":
        return db.query(FocusSession).filter(FocusSession.status.in_(["active", "paused"])).all()
    else:
        return db.query(FocusSession).filter(FocusSession.student_id == current_user.id).all()


@router.get("/history", response_model=List[FocusSessionResponse])
def get_focus_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(FocusSession).filter(
        FocusSession.student_id == current_user.id,
        FocusSession.status == "completed"
    ).order_by(FocusSession.ended_at.desc()).all()


@router.get("/analytics", response_model=FocusAnalyticsResponse)
def get_focus_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Computes real, persisted Focus Mode analytics: daily/weekly study totals,
    break duration, completion rates, and 7-day chronological progression.
    """
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    seven_days_ago = today_start - timedelta(days=6)

    base_query = db.query(FocusSession)
    if current_user.role != "teacher":
        base_query = base_query.filter(FocusSession.student_id == current_user.id)

    all_sessions = base_query.all()
    completed_sessions = [s for s in all_sessions if s.status == "completed"]
    abandoned_sessions = [s for s in all_sessions if s.status == "abandoned"]

    def to_utc(dt):
        if not dt:
            return None
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

    daily_focus_seconds = sum(
        s.actual_focus_seconds for s in all_sessions
        if s.started_at and to_utc(s.started_at) >= today_start
    )
    weekly_focus_seconds = sum(
        s.actual_focus_seconds for s in all_sessions
        if s.started_at and to_utc(s.started_at) >= seven_days_ago
    )
    total_break_seconds = sum(s.actual_break_seconds for s in all_sessions)

    total_count = len(all_sessions)
    completed_count = len(completed_sessions)
    completion_rate = round((completed_count / total_count * 100.0), 1) if total_count > 0 else 100.0

    daily_trends = []
    for i in range(7):
        day_date = (seven_days_ago + timedelta(days=i)).date()
        day_sessions = [
            s for s in all_sessions
            if s.started_at and to_utc(s.started_at).date() == day_date
        ]
        focus_mins = sum(s.actual_focus_seconds for s in day_sessions) // 60
        break_mins = sum(s.actual_break_seconds for s in day_sessions) // 60
        daily_trends.append(FocusDailyTrend(
            date=day_date.strftime("%a %d"),
            focus_minutes=focus_mins,
            break_minutes=break_mins
        ))

    return FocusAnalyticsResponse(
        daily_focus_seconds=daily_focus_seconds,
        weekly_focus_seconds=weekly_focus_seconds,
        total_completed_sessions=completed_count,
        total_abandoned_sessions=len(abandoned_sessions),
        total_break_seconds=total_break_seconds,
        completion_rate_percentage=completion_rate,
        daily_trends=daily_trends
    )


@router.get("/sessions/{session_id}", response_model=FocusSessionResponse)
def get_focus_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(FocusSession).filter(FocusSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus session not found")

    if current_user.role != "teacher" and session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return session


@router.post("/sessions/{session_id}/pause", response_model=FocusSessionResponse)
def pause_focus_session(
    session_id: str,
    req: FocusSessionActionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(FocusSession).filter(FocusSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only session owner can pause focus session")

    if session.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot pause focus session in status {session.status}")

    session.status = "paused"
    if req.additional_focus_seconds:
        session.actual_focus_seconds += req.additional_focus_seconds
    if req.notes:
        session.notes = req.notes
    db.commit()
    db.refresh(session)

    client_ip = request.client.host if request.client else None
    log_action(db, action="FOCUS_SESSION_PAUSED", actor_user_id=current_user.id, target_resource=session.id, ip_address=client_ip)

    return session


@router.post("/sessions/{session_id}/resume", response_model=FocusSessionResponse)
def resume_focus_session(
    session_id: str,
    req: FocusSessionActionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(FocusSession).filter(FocusSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only session owner can resume focus session")

    if session.status != "paused":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot resume focus session in status {session.status}")

    session.status = "active"
    if req.additional_break_seconds:
        session.actual_break_seconds += req.additional_break_seconds
    db.commit()
    db.refresh(session)

    client_ip = request.client.host if request.client else None
    log_action(db, action="FOCUS_SESSION_RESUMED", actor_user_id=current_user.id, target_resource=session.id, ip_address=client_ip)

    return session


@router.post("/sessions/{session_id}/complete", response_model=FocusSessionResponse)
def complete_focus_session(
    session_id: str,
    req: FocusSessionActionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(FocusSession).filter(FocusSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only session owner can complete focus session")

    now = datetime.now(timezone.utc)
    session.status = "completed"
    session.ended_at = now
    if req.additional_focus_seconds:
        session.actual_focus_seconds += req.additional_focus_seconds
    if req.additional_break_seconds:
        session.actual_break_seconds += req.additional_break_seconds
    if req.notes:
        session.notes = req.notes
    db.commit()
    db.refresh(session)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="FOCUS_SESSION_COMPLETED",
        actor_user_id=current_user.id,
        target_resource=session.id,
        ip_address=client_ip,
        details={"focus_seconds": session.actual_focus_seconds, "break_seconds": session.actual_break_seconds}
    )

    return session

