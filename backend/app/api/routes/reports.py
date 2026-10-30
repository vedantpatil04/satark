import io
import csv
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import (
    User, Classroom, ClassroomEnrollment, ExamSession, ExamSubmission,
    StudentAnswer, Alert, ActivityEvent
)
from backend.app.services.audit_service import log_action

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])


@router.get("/exams/{exam_id}/summary")
def get_exam_report_summary(
    exam_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Generates comprehensive, persisted institutional report summary for an examination session.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Enrolled students count
    total_enrolled = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == exam.classroom_id
    ).count()

    # Submissions
    submissions = db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).all()
    sub_count = len(submissions)
    scores = [s.score for s in submissions if s.score is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
    highest_score = max(scores) if scores else 0

    # Alerts & Integrity
    alerts = db.query(Alert).filter(Alert.session_id == exam_id).all()
    total_alerts = len(alerts)
    acknowledged_alerts = sum(1 for a in alerts if a.is_acknowledged)

    tab_switch_events = db.query(ActivityEvent).filter(
        ActivityEvent.session_id == exam_id,
        ActivityEvent.event_type == "tab_switch"
    ).count()

    # Per-student roster breakdown (include all students who submitted or are enrolled)
    candidate_ids = set(s.student_id for s in submissions)
    enrolled_students = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == exam.classroom_id
    ).all()
    for e in enrolled_students:
        candidate_ids.add(e.student_id)

    student_summaries = []
    for stu_id in candidate_ids:
        stu = db.query(User).filter(User.id == stu_id).first()
        if not stu:
            continue
        sub = next((s for s in submissions if s.student_id == stu.id), None)
        stu_tab_switches = db.query(ActivityEvent).filter(
            ActivityEvent.session_id == exam_id,
            ActivityEvent.student_id == stu.id,
            ActivityEvent.event_type == "tab_switch"
        ).count()
        stu_alerts = [a for a in alerts if a.student_id == stu.id]

        student_summaries.append({
            "student_id": stu.id,
            "student_name": stu.full_name,
            "email": stu.email,
            "submission_status": sub.status if sub else "not_submitted",
            "score": sub.score if sub else None,
            "total_marks": sub.total_marks if sub else None,
            "percentage": sub.percentage if sub else None,
            "submitted_at": sub.submitted_at.isoformat() if sub and sub.submitted_at else None,
            "tab_switch_count": stu_tab_switches,
            "total_alerts": len(stu_alerts)
        })

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "exam_code": exam.exam_code,
        "status": exam.status,
        "duration_minutes": exam.duration_minutes,
        "classroom_id": exam.classroom_id,
        "total_enrolled": total_enrolled,
        "total_submissions": sub_count,
        "average_score": avg_score,
        "highest_score": highest_score,
        "total_alerts": total_alerts,
        "acknowledged_alerts": acknowledged_alerts,
        "total_tab_switches": tab_switch_events,
        "candidates": student_summaries
    }


@router.get("/exams/{exam_id}/export-csv")
def export_exam_csv(
    exam_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Exports clean, human-readable CSV of examination submissions, scores, and integrity incidents.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    submissions = db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).all()
    output = io.StringIO()
    writer = csv.writer(output)

    # CSV Headers
    writer.writerow([
        "Student Name", "Email", "Status", "Score", "Total Marks",
        "Percentage", "Submission Timestamp", "Tab Switches", "Integrity Alerts"
    ])

    candidate_ids = set(s.student_id for s in submissions)
    enrolled = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == exam.classroom_id).all()
    for e in enrolled:
        candidate_ids.add(e.student_id)

    for stu_id in candidate_ids:
        stu = db.query(User).filter(User.id == stu_id).first()
        if not stu:
            continue
        sub = next((s for s in submissions if s.student_id == stu.id), None)
        tab_switches = db.query(ActivityEvent).filter(
            ActivityEvent.session_id == exam_id,
            ActivityEvent.student_id == stu.id,
            ActivityEvent.event_type == "tab_switch"
        ).count()
        alert_count = db.query(Alert).filter(
            Alert.session_id == exam_id,
            Alert.student_id == stu.id
        ).count()

        writer.writerow([
            stu.full_name,
            stu.email,
            sub.status if sub else "Not Submitted",
            sub.score if sub else "N/A",
            sub.total_marks if sub else "N/A",
            f"{sub.percentage}%" if sub and sub.percentage is not None else "N/A",
            sub.submitted_at.strftime("%Y-%m-%d %H:%M:%S UTC") if sub and sub.submitted_at else "N/A",
            tab_switches,
            alert_count
        ])

    output.seek(0)
    filename = f"SATARK_Exam_{exam.exam_code}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/exams/{exam_id}/evidence/snapshot")
def record_authorized_evidence_snapshot(
    exam_id: str,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Records an authorized, transparent timestamped evidence snapshot associated with an exam breach.
    Guarantees: Never covert, student client displays visible indicator.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    evidence_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    reason = payload.get("reason", "manual_or_breach_checkpoint")
    metadata_info = payload.get("metadata", {})

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="EVIDENCE_SNAPSHOT_CAPTURED",
        actor_user_id=current_user.id,
        target_resource=exam_id,
        ip_address=client_ip,
        details={
            "evidence_id": evidence_id,
            "reason": reason,
            "captured_at": now.isoformat(),
            "metadata": metadata_info
        }
    )

    return {
        "status": "recorded",
        "evidence_id": evidence_id,
        "exam_id": exam_id,
        "student_id": current_user.id,
        "recorded_at": now.isoformat(),
        "retention_policy": "30_days_institutional_audit"
    }
