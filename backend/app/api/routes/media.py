from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import (
    User, ClassroomEnrollment, ExamSession, DeviceSession, Device,
    Alert, ActivityEvent, ExamMediaSession, MediaShareRequest, MediaSessionParticipant, AuditLog
)
from backend.app.schemas import (
    LiveKitTokenRequest, LiveKitTokenResponse, MediaShareStatusResponse
)
from backend.app.services.audit_service import log_action
from backend.app.services.livekit_service import generate_livekit_token, is_livekit_configured
from backend.app.websocket.manager import ws_manager

router = APIRouter(prefix="/media", tags=["Live WebRTC & Monitoring"])


def get_or_create_exam_media_session(db: Session, exam_id: str) -> ExamMediaSession:
    media_session = db.query(ExamMediaSession).filter(ExamMediaSession.exam_id == exam_id).first()
    if not media_session:
        room_name = f"satark-exam-{exam_id}"
        media_session = ExamMediaSession(
            exam_id=exam_id,
            room_name=room_name,
            status="active",
            created_at=datetime.now(timezone.utc)
        )
        db.add(media_session)
        db.commit()
        db.refresh(media_session)
    return media_session


@router.post("/{exam_id}/token")
def get_media_token(
    exam_id: str,
    req: Optional[LiveKitTokenRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Issues role-scoped, short-lived LiveKit SFU access token for an authorized exam room.
    - Teachers receive room subscription permissions.
    - Students receive screen publication permissions (with subscription blocked).
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    room_name = f"satark-exam-{exam.id}"
    media_session = get_or_create_exam_media_session(db, exam.id)

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Not your exam")
        can_pub = False
        can_sub = True
    else:
        # Student authorization
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == exam.classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this classroom cohort")

        # In production, check exam is active or scheduled
        if exam.status not in ["active", "scheduled", "draft"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Exam media unavailable in '{exam.status}' status")

        can_pub = True
        can_sub = False  # Privacy: Students cannot subscribe to other students' screens

    # Register participant
    participant = db.query(MediaSessionParticipant).filter(
        MediaSessionParticipant.exam_id == exam.id,
        MediaSessionParticipant.user_id == current_user.id
    ).first()

    now = datetime.now(timezone.utc)
    if participant:
        participant.connection_status = "connected"
        participant.left_at = None
    else:
        participant = MediaSessionParticipant(
            exam_id=exam.id,
            user_id=current_user.id,
            role=current_user.role,
            is_sharing_screen=False,
            is_camera_on=False,
            connection_status="connected",
            joined_at=now
        )
        db.add(participant)
    db.commit()

    token_data = generate_livekit_token(
        user_id=current_user.id,
        user_name=current_user.full_name,
        role=current_user.role,
        room_name=room_name,
        exam_id=exam.id,
        can_publish=can_pub,
        can_subscribe=can_sub
    )

    return token_data


@router.get("/{exam_id}/overview")
def get_monitoring_overview(
    exam_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Returns full multi-student live monitoring telemetry for the teacher live workspace.
    Includes connection status, device metadata, screen sharing state, and recent alerts.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    media_session = get_or_create_exam_media_session(db, exam.id)

    # All enrolled students
    enrollments = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == exam.classroom_id
    ).all()

    # Query device sessions for this exam
    device_sessions = db.query(DeviceSession).filter(
        DeviceSession.session_id == str(exam_id),
        DeviceSession.is_active == True
    ).all()
    device_by_student = {str(ds.student_id): ds.device for ds in device_sessions if ds.device}

    # Query active media share requests
    share_requests = db.query(MediaShareRequest).filter(
        MediaShareRequest.exam_id == exam.id
    ).all()
    request_by_student = {str(sr.student_id): sr for sr in share_requests}

    # Query media participants
    participants = db.query(MediaSessionParticipant).filter(
        MediaSessionParticipant.exam_id == exam.id
    ).all()
    participant_by_student = {str(p.user_id): p for p in participants}

    # Query alerts for this exam
    alerts = db.query(Alert).filter(Alert.session_id == exam.id).all()
    alerts_by_student = {}
    for a in alerts:
        alerts_by_student.setdefault(str(a.student_id), []).append(a)

    student_cards = []
    sharing_count = 0
    connected_count = 0

    for en in enrollments:
        student = en.student
        if not student:
            continue

        student_id_str = str(student.id)
        dev = device_by_student.get(student_id_str)
        part = participant_by_student.get(student_id_str)
        req_obj = request_by_student.get(student_id_str)
        st_alerts = alerts_by_student.get(student_id_str, [])

        is_sharing = bool(part and part.is_sharing_screen)
        if is_sharing:
            sharing_count += 1

        conn_status = "offline"
        if part and part.connection_status == "connected":
            conn_status = "connected"
            connected_count += 1
        elif dev and dev.status == "connected":
            conn_status = "connected"
            connected_count += 1

        share_status = "not_started"
        if req_obj:
            share_status = req_obj.status
        if is_sharing:
            share_status = "sharing"

        # Latest activity event
        last_event = db.query(ActivityEvent).filter(
            ActivityEvent.student_id == student.id,
            ActivityEvent.session_id == str(exam_id)
        ).order_by(ActivityEvent.occurred_at.desc()).first()

        roll_num = student.student_profile.student_id_number if student.student_profile else "N/A"

        student_cards.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "email": student.email,
            "roll_number": roll_num,
            "device_id": dev.id if dev else None,
            "device_hostname": dev.hostname if dev else None,
            "os_type": dev.os_type if dev else "browser",
            "os_version": dev.os_version if dev else None,
            "connection_status": conn_status,
            "is_sharing_screen": is_sharing,
            "share_status": share_status,
            "alert_count": len(st_alerts),
            "unacknowledged_alerts": sum(1 for a in st_alerts if not a.is_acknowledged),
            "last_activity_at": last_event.occurred_at.isoformat() if last_event else None,
            "recent_alerts": [
                {
                    "id": a.id,
                    "alert_type": a.alert_type,
                    "severity": a.severity,
                    "description": a.description,
                    "is_acknowledged": a.is_acknowledged,
                    "created_at": a.created_at.isoformat()
                } for a in st_alerts[-5:]
            ]
        })

    return {
        "exam_id": exam.id,
        "title": exam.title,
        "classroom_id": exam.classroom_id,
        "exam_code": exam.exam_code,
        "status": exam.status,
        "duration_minutes": exam.duration_minutes,
        "actual_start": exam.actual_start.isoformat() if exam.actual_start else None,
        "room_name": media_session.room_name,
        "is_livekit_configured": is_livekit_configured(),
        "total_enrolled": len(enrollments),
        "connected_count": connected_count,
        "active_streamers": sharing_count,
        "total_alerts": len(alerts),
        "students": student_cards
    }


@router.post("/{exam_id}/request-share")
async def request_student_screen_share(
    exam_id: str,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher explicitly requests a student (or all students) to initiate browser screen sharing.
    Dispatches real-time WebSocket prompt to the student portal.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    target_student_id = payload.get("student_id")
    now = datetime.now(timezone.utc)

    target_ids = []
    if target_student_id:
        target_ids.append(str(target_student_id))
    else:
        # Request all enrolled students
        enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == exam.classroom_id).all()
        target_ids = [str(e.student_id) for e in enrollments]

    for st_id in target_ids:
        req_record = db.query(MediaShareRequest).filter(
            MediaShareRequest.exam_id == exam.id,
            MediaShareRequest.student_id == st_id
        ).first()
        if req_record:
            req_record.status = "pending"
            req_record.requested_at = now
            req_record.responded_at = None
        else:
            req_record = MediaShareRequest(
                exam_id=exam.id,
                student_id=st_id,
                teacher_id=current_user.id,
                status="pending",
                requested_at=now
            )
            db.add(req_record)

        # Send WebSocket request to student
        await ws_manager.send_to_student(st_id, {
            "type": "screen_share_request",
            "exam_id": exam.id,
            "exam_title": exam.title,
            "teacher_id": current_user.id,
            "teacher_name": current_user.full_name,
            "timestamp": now.isoformat()
        })

    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="SCREEN_SHARE_REQUESTED_BY_TEACHER",
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip,
        details={"targets": target_ids}
    )

    return {"message": f"Screen share request dispatched to {len(target_ids)} student(s)"}


@router.post("/{exam_id}/share-response")
async def respond_to_share_request(
    exam_id: str,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student submits explicit consent response (approved or rejected) for screen sharing.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students only")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    approved = bool(payload.get("approved"))
    status_str = "approved" if approved else "rejected"
    now = datetime.now(timezone.utc)

    req_record = db.query(MediaShareRequest).filter(
        MediaShareRequest.exam_id == exam.id,
        MediaShareRequest.student_id == current_user.id
    ).first()

    if req_record:
        req_record.status = status_str
        req_record.responded_at = now
    else:
        req_record = MediaShareRequest(
            exam_id=exam.id,
            student_id=current_user.id,
            teacher_id=exam.teacher_id,
            status=status_str,
            requested_at=now,
            responded_at=now
        )
        db.add(req_record)
    db.commit()

    # Inform teacher via WebSocket
    await ws_manager.send_to_teacher(exam.teacher_id, {
        "type": "screen_share_consent_response",
        "exam_id": exam.id,
        "student_id": current_user.id,
        "student_name": current_user.full_name,
        "approved": approved,
        "timestamp": now.isoformat()
    })

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="SCREEN_SHARE_CONSENT_" + ("APPROVED" if approved else "REJECTED"),
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip
    )

    return {"status": status_str, "student_id": current_user.id}


@router.post("/{exam_id}/stream-state")
async def update_stream_state(
    exam_id: str,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student publishes live track status: 'sharing' or 'stopped'.
    Maintains server state and notifies teacher live grid immediately.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    is_sharing = bool(payload.get("is_sharing"))
    now = datetime.now(timezone.utc)

    participant = db.query(MediaSessionParticipant).filter(
        MediaSessionParticipant.exam_id == exam.id,
        MediaSessionParticipant.user_id == current_user.id
    ).first()

    if participant:
        participant.is_sharing_screen = is_sharing
        if not is_sharing:
            participant.connection_status = "idle"
        else:
            participant.connection_status = "connected"

    # Also update request record
    req_record = db.query(MediaShareRequest).filter(
        MediaShareRequest.exam_id == exam.id,
        MediaShareRequest.student_id == current_user.id
    ).first()
    if req_record:
        req_record.status = "sharing" if is_sharing else "stopped"

    db.commit()

    # Notify teacher dashboard over WebSocket
    await ws_manager.send_to_teacher(exam.teacher_id, {
        "type": "student_stream_state",
        "exam_id": exam.id,
        "student_id": current_user.id,
        "student_name": current_user.full_name,
        "is_sharing_screen": is_sharing,
        "timestamp": now.isoformat()
    })

    return {"is_sharing": is_sharing, "student_id": current_user.id}


@router.post("/{exam_id}/broadcast")
async def broadcast_announcement(
    exam_id: str,
    payload: Dict[str, Any],
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher broadcasts an examination announcement or instruction to all participating students.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    message_text = payload.get("message", "").strip()
    if not message_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message cannot be empty")

    now = datetime.now(timezone.utc)
    announcement_payload = {
        "type": "exam_announcement",
        "exam_id": exam.id,
        "exam_title": exam.title,
        "teacher_name": current_user.full_name,
        "message": message_text,
        "priority": payload.get("priority", "normal"),
        "timestamp": now.isoformat()
    }

    # Broadcast to all students in classroom
    enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == exam.classroom_id).all()
    for en in enrollments:
        await ws_manager.send_to_student(en.student_id, announcement_payload)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="TEACHER_EXAM_ANNOUNCEMENT",
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip,
        details={"message": message_text}
    )

    return {"message": "Announcement broadcast successfully", "recipient_count": len(enrollments)}

