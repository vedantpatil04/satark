import secrets
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import (
    User, Classroom, ClassroomEnrollment, ExamSession, DeviceSession, Device,
    ExamQuestion, ExamSubmission, StudentAnswer, ActivityEvent,
    QuestionBankItem, ExamQuestionSnapshot, ExamMediaSession
)
from backend.app.schemas import (
    ExamCreate, ExamResponse, ExamJoinRequest, ExamActionResponse,
    ExamGrantTimeRequest, ExamGrantTimeResponse,
    ExamQuestionCreate, ExamQuestionUpdate, ExamQuestionResponse,
    SaveAnswerRequest, StudentAnswerResponse, ExamSubmitRequest,
    ExamSubmissionResponse, EventEnvelope,
    ExamImportQuestionsFromBankRequest, ExamQuestionSnapshotResponse
)
from backend.app.services.audit_service import log_action
from backend.app.services.event_service import ingest_event_envelope
from backend.app.websocket.manager import ws_manager

router = APIRouter(prefix="/exams", tags=["Exam Mode"])


def generate_exam_code() -> str:
    return secrets.token_hex(3).upper()


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
def create_exam(
    req: ExamCreate,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    classroom = db.query(Classroom).filter(Classroom.id == req.classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    if classroom.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Not your classroom")

    exam_code = req.exam_code.strip().upper() if req.exam_code else generate_exam_code()
    while db.query(ExamSession).filter(ExamSession.exam_code == exam_code).first():
        exam_code = generate_exam_code()

    scheduled_start = req.scheduled_start or datetime.now(timezone.utc)

    exam = ExamSession(
        classroom_id=classroom.id,
        teacher_id=current_user.id,
        title=req.title.strip(),
        description=req.description.strip() if req.description else None,
        exam_code=exam_code,
        duration_minutes=req.duration_minutes,
        scheduled_start=scheduled_start,
        status="draft",
        policy_config=req.policy_config or {}
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="EXAM_CREATED",
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip,
        details={"title": exam.title, "exam_code": exam.exam_code}
    )

    return exam


@router.get("", response_model=List[ExamResponse])
def list_exams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "teacher":
        return db.query(ExamSession).filter(ExamSession.teacher_id == current_user.id).all()
    else:
        # Enrolled classrooms for student
        enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.student_id == current_user.id).all()
        classroom_ids = [e.classroom_id for e in enrollments]
        return db.query(ExamSession).filter(
            ExamSession.classroom_id.in_(classroom_ids),
            ExamSession.status.in_(["scheduled", "active", "paused", "ended"])
        ).all()


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == exam.classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this examination classroom")

    return exam


@router.post("/{exam_id}/join", response_model=ExamResponse)
def join_exam(
    exam_id: str,
    req: ExamJoinRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only students can join exams")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if exam.exam_code != req.exam_code.strip().upper():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid exam entry code")

    if exam.status not in ["scheduled", "active", "draft"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot join exam in state {exam.status}")

    # Check enrollment
    enrollment = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == exam.classroom_id,
        ClassroomEnrollment.student_id == current_user.id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student is not enrolled in this classroom cohort")

    # Bind device session if device_id provided
    if req.device_id:
        device = db.query(Device).filter(Device.id == req.device_id).first()
        if device:
            dev_session = DeviceSession(
                device_id=device.id,
                student_id=current_user.id,
                session_id=exam.id,
                mode="exam",
                is_active=True
            )
            db.add(dev_session)
            db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="STUDENT_JOINED_EXAM",
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip
    )

    return exam


@router.post("/{exam_id}/start", response_model=ExamActionResponse)
async def start_exam(
    exam_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot start exam from status '{exam.status}'")

    now = datetime.now(timezone.utc)
    exam.status = "active"
    exam.actual_start = now

    # Preserve an immutable examination question snapshot before students access
    existing_snap = db.query(ExamQuestionSnapshot).filter(ExamQuestionSnapshot.exam_id == exam.id).first()
    if not existing_snap:
        q_list = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam.id).order_by(ExamQuestion.order_num).all()
        snap_items = [
            {
                "id": str(q.id),
                "question_text": q.question_text,
                "options": q.options,
                "correct_option_index": q.correct_option_index,
                "marks": q.marks,
                "order_num": q.order_num
            } for q in q_list
        ]
        db.add(ExamQuestionSnapshot(
            exam_id=exam.id,
            snapshot_data=snap_items,
            total_questions=len(snap_items),
            total_marks=sum(it["marks"] for it in snap_items),
            created_at=now
        ))

    # Activate Media Monitoring Session
    media_session = db.query(ExamMediaSession).filter(ExamMediaSession.exam_id == exam.id).first()
    if not media_session:
        db.add(ExamMediaSession(
            exam_id=exam.id,
            room_name=f"satark-exam-{exam.id}",
            status="active",
            created_at=now
        ))
    else:
        media_session.status = "active"
        media_session.closed_at = None

    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(db, action="EXAM_STARTED", actor_user_id=current_user.id, target_resource=exam.id, ip_address=client_ip)

    await ws_manager.broadcast_to_teachers({"type": "exam_state_changed", "exam_id": exam.id, "status": "active"})
    await ws_manager.broadcast_to_students({"type": "exam_state_changed", "exam_id": exam.id, "status": "active"})
    return ExamActionResponse(id=exam.id, status=exam.status, message="Exam session successfully activated")


@router.post("/{exam_id}/pause", response_model=ExamActionResponse)
async def pause_exam(
    exam_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot pause exam from status '{exam.status}'")

    exam.status = "paused"
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(db, action="EXAM_PAUSED", actor_user_id=current_user.id, target_resource=exam.id, ip_address=client_ip)

    await ws_manager.broadcast_to_teachers({"type": "exam_state_changed", "exam_id": exam.id, "status": "paused"})
    return ExamActionResponse(id=exam.id, status=exam.status, message="Exam session paused")


@router.post("/{exam_id}/resume", response_model=ExamActionResponse)
async def resume_exam(
    exam_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status != "paused":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot resume exam from status '{exam.status}'")

    exam.status = "active"
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(db, action="EXAM_RESUMED", actor_user_id=current_user.id, target_resource=exam.id, ip_address=client_ip)

    await ws_manager.broadcast_to_teachers({"type": "exam_state_changed", "exam_id": exam.id, "status": "active"})
    return ExamActionResponse(id=exam.id, status=exam.status, message="Exam session resumed")


@router.post("/{exam_id}/end", response_model=ExamActionResponse)
async def end_exam(
    exam_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status == "ended":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam session is already ended")

    now = datetime.now(timezone.utc)
    exam.status = "ended"
    exam.actual_end = now

    media_session = db.query(ExamMediaSession).filter(ExamMediaSession.exam_id == exam.id).first()
    if media_session:
        media_session.status = "ended"
        media_session.closed_at = now

    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(db, action="EXAM_ENDED", actor_user_id=current_user.id, target_resource=exam.id, ip_address=client_ip)

    await ws_manager.broadcast_to_teachers({"type": "exam_state_changed", "exam_id": exam.id, "status": "ended"})
    await ws_manager.broadcast_to_students({"type": "exam_state_changed", "exam_id": exam.id, "status": "ended"})
    return ExamActionResponse(id=exam.id, status=exam.status, message="Exam session finalized and sealed")


@router.post("/{exam_id}/grant-time", response_model=ExamGrantTimeResponse)
async def grant_exam_time(
    exam_id: str,
    req: ExamGrantTimeRequest,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status not in ["active", "paused"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot grant additional time when exam is in '{exam.status}' state"
        )

    exam.duration_minutes += req.additional_minutes
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="EXAM_TIME_EXTENDED",
        actor_user_id=current_user.id,
        target_resource=exam.id,
        ip_address=client_ip,
        details={"additional_minutes": req.additional_minutes, "new_duration_minutes": exam.duration_minutes}
    )

    await ws_manager.broadcast_to_teachers({
        "type": "exam_time_granted",
        "exam_id": exam.id,
        "additional_minutes": req.additional_minutes,
        "duration_minutes": exam.duration_minutes
    })
    await ws_manager.broadcast_to_students({
        "type": "exam_time_granted",
        "exam_id": exam.id,
        "additional_minutes": req.additional_minutes,
        "duration_minutes": exam.duration_minutes
    })

    return ExamGrantTimeResponse(
        exam_id=exam.id,
        duration_minutes=exam.duration_minutes,
        additional_minutes=req.additional_minutes,
        message=f"Successfully granted {req.additional_minutes} additional minutes to the examination"
    )


# ==========================================
# Question Management Endpoints (Feature 1)
# ==========================================
@router.post("/{exam_id}/questions", response_model=ExamQuestionResponse, status_code=status.HTTP_201_CREATED)
def create_exam_question(
    exam_id: str,
    req: ExamQuestionCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Not your exam")

    # Only permit question editing before exam starts
    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add questions when exam is in '{exam.status}' state. Only draft or scheduled exams can be edited."
        )

    if req.correct_option_index < 0 or req.correct_option_index >= len(req.options):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="correct_option_index must be a valid index into the options array"
        )

    # Determine order number
    max_order = db.query(ExamQuestion.order_num).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num.desc()).first()
    order_num = (max_order[0] + 1) if max_order else 1
    if req.order_num is not None:
        order_num = req.order_num

    question = ExamQuestion(
        exam_id=exam.id,
        question_text=req.question_text.strip(),
        options=req.options,
        correct_option_index=req.correct_option_index,
        marks=req.marks,
        order_num=order_num
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.get("/{exam_id}/questions", response_model=List[ExamQuestionResponse])
def get_exam_questions(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        # Teacher receives full questions including correct answer key
        return db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
    else:
        # Student validation
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == exam.classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this examination classroom")

        questions = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
        # Security requirement: NEVER expose correct answers to student question responses
        sanitized = []
        for q in questions:
            sanitized.append(ExamQuestionResponse(
                id=q.id,
                exam_id=q.exam_id,
                question_text=q.question_text,
                options=q.options,
                marks=q.marks,
                order_num=q.order_num,
                correct_option_index=None,  # Withheld from students
                created_at=q.created_at
            ))
        return sanitized


@router.put("/{exam_id}/questions/{question_id}", response_model=ExamQuestionResponse)
def update_exam_question(
    exam_id: str,
    question_id: str,
    req: ExamQuestionUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit questions when exam is in '{exam.status}' state."
        )

    question = db.query(ExamQuestion).filter(
        ExamQuestion.id == question_id,
        ExamQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    if req.question_text is not None:
        question.question_text = req.question_text.strip()
    if req.options is not None:
        question.options = req.options
    if req.correct_option_index is not None:
        if req.correct_option_index < 0 or req.correct_option_index >= len(question.options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid correct_option_index")
        question.correct_option_index = req.correct_option_index
    if req.marks is not None:
        question.marks = req.marks
    if req.order_num is not None:
        question.order_num = req.order_num

    db.commit()
    db.refresh(question)
    return question


@router.delete("/{exam_id}/questions/{question_id}")
def delete_exam_question(
    exam_id: str,
    question_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete questions when exam is in '{exam.status}' state."
        )

    question = db.query(ExamQuestion).filter(
        ExamQuestion.id == question_id,
        ExamQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    db.delete(question)
    db.commit()
    return {"message": "Question deleted successfully"}


@router.post("/{exam_id}/import-from-bank", response_model=List[ExamQuestionResponse])
def import_questions_from_bank(
    exam_id: str,
    req: ExamImportQuestionsFromBankRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Imports selected questions from Question Bank items into an examination as an independent snapshot copy.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add questions when exam is in '{exam.status}' state."
        )

    # Get max current order_num
    max_order = db.query(ExamQuestion.order_num).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num.desc()).first()
    next_order = (max_order[0] + 1) if max_order else 1

    bank_items = db.query(QuestionBankItem).filter(QuestionBankItem.id.in_(req.item_ids)).all()
    if not bank_items:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No valid question bank items found")

    new_questions = []
    now = datetime.now(timezone.utc)
    for it in bank_items:
        q = ExamQuestion(
            exam_id=exam.id,
            question_text=it.question_text,
            options=it.options,
            correct_option_index=it.correct_option_index,
            marks=it.marks,
            order_num=next_order,
            created_at=now,
            updated_at=now
        )
        db.add(q)
        new_questions.append(q)
        next_order += 1

    db.commit()
    for q in new_questions:
        db.refresh(q)

    return new_questions


@router.post("/{exam_id}/snapshot", response_model=ExamQuestionSnapshotResponse)
def create_exam_snapshot(
    exam_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Explicitly freezes or updates the immutable snapshot of examination questions.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    q_list = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam.id).order_by(ExamQuestion.order_num).all()
    now = datetime.now(timezone.utc)
    snap_items = [
        {
            "id": str(q.id),
            "question_text": q.question_text,
            "options": q.options,
            "correct_option_index": q.correct_option_index,
            "marks": q.marks,
            "order_num": q.order_num
        } for q in q_list
    ]

    snap = db.query(ExamQuestionSnapshot).filter(ExamQuestionSnapshot.exam_id == exam.id).first()
    if snap:
        snap.snapshot_data = snap_items
        snap.total_questions = len(snap_items)
        snap.total_marks = sum(it["marks"] for it in snap_items)
    else:
        snap = ExamQuestionSnapshot(
            exam_id=exam.id,
            snapshot_data=snap_items,
            total_questions=len(snap_items),
            total_marks=sum(it["marks"] for it in snap_items),
            created_at=now
        )
        db.add(snap)

    db.commit()
    db.refresh(snap)
    return snap


@router.get("/{exam_id}/snapshot", response_model=ExamQuestionSnapshotResponse)
def get_exam_snapshot(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves the immutable snapshot of examination questions.
    Students receive sanitized questions with correct answers withheld during active exams.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == exam.classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled")

    snap = db.query(ExamQuestionSnapshot).filter(ExamQuestionSnapshot.exam_id == exam.id).first()
    if not snap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not yet created")

    if current_user.role == "student" and exam.status != "ended":
        # Withhold correct answers from students
        sanitized_items = []
        for it in snap.snapshot_data:
            sanitized_it = dict(it)
            sanitized_it.pop("correct_option_index", None)
            sanitized_items.append(sanitized_it)
        return ExamQuestionSnapshotResponse(
            id=snap.id,
            exam_id=snap.exam_id,
            total_questions=snap.total_questions,
            total_marks=snap.total_marks,
            snapshot_data=sanitized_items,
            created_at=snap.created_at
        )

    return snap



# ==========================================
# Student Answer & Submission Endpoints
# ==========================================
@router.post("/{exam_id}/answers", response_model=StudentAnswerResponse)
def save_student_answer(
    exam_id: str,
    req: SaveAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can save answers")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if exam.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot save answer: Exam status is '{exam.status}'")

    # Prevent saving answers after submission
    submission = db.query(ExamSubmission).filter(
        ExamSubmission.exam_id == exam_id,
        ExamSubmission.student_id == current_user.id
    ).first()
    if submission:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam already submitted")

    question = db.query(ExamQuestion).filter(
        ExamQuestion.id == req.question_id,
        ExamQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found in this exam")

    now = datetime.now(timezone.utc)
    answer = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == current_user.id,
        StudentAnswer.question_id == req.question_id
    ).first()

    if answer:
        answer.selected_option_index = req.selected_option_index
        answer.answered_at = now
    else:
        answer = StudentAnswer(
            exam_id=exam_id,
            student_id=current_user.id,
            question_id=req.question_id,
            selected_option_index=req.selected_option_index,
            answered_at=now
        )
        db.add(answer)

    db.commit()
    db.refresh(answer)
    return answer


@router.get("/{exam_id}/answers", response_model=List[StudentAnswerResponse])
def get_student_answers(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students only")

    return db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == current_user.id
    ).all()


@router.post("/{exam_id}/submit", response_model=ExamSubmissionResponse)
async def submit_exam(
    exam_id: str,
    req: ExamSubmitRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can submit exams")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Prevent submission after exam has ended
    if exam.status == "ended":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Examination has concluded; submissions closed")

    # Prevent duplicate final submissions
    existing_sub = db.query(ExamSubmission).filter(
        ExamSubmission.exam_id == exam_id,
        ExamSubmission.student_id == current_user.id
    ).first()
    if existing_sub:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate submission rejected: Your examination was already submitted"
        )

    now = datetime.now(timezone.utc)

    # Persist any answers included in the final payload
    if req.answers:
        for a in req.answers:
            ans_record = db.query(StudentAnswer).filter(
                StudentAnswer.exam_id == exam_id,
                StudentAnswer.student_id == current_user.id,
                StudentAnswer.question_id == a.question_id
            ).first()
            if ans_record:
                ans_record.selected_option_index = a.selected_option_index
                ans_record.answered_at = now
            else:
                db.add(StudentAnswer(
                    exam_id=exam_id,
                    student_id=current_user.id,
                    question_id=a.question_id,
                    selected_option_index=a.selected_option_index,
                    answered_at=now
                ))
        db.commit()

    # Calculate objective MCQ marks on the backend
    questions = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).all()
    student_answers = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == current_user.id
    ).all()
    ans_by_q = {a.question_id: a for a in student_answers}

    total_marks = sum(q.marks for q in questions)
    score = 0

    for q in questions:
        ans = ans_by_q.get(q.id)
        if ans and ans.selected_option_index is not None and ans.selected_option_index == q.correct_option_index:
            ans.is_correct = True
            ans.marks_awarded = q.marks
            score += q.marks
        else:
            if ans:
                ans.is_correct = False
                ans.marks_awarded = 0

    percentage = round((score / total_marks * 100), 2) if total_marks > 0 else 0.0

    submission = ExamSubmission(
        exam_id=exam_id,
        student_id=current_user.id,
        score=score,
        total_marks=total_marks,
        percentage=percentage,
        status="submitted",
        submitted_at=now
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Associate submission_id to answers
    for ans in student_answers:
        ans.submission_id = submission.id
    db.commit()

    # Record audit event
    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="STUDENT_EXAM_SUBMITTED",
        actor_user_id=current_user.id,
        target_resource=exam_id,
        ip_address=client_ip,
        details={"score": score, "total_marks": total_marks, "percentage": percentage}
    )

    # Real-time WebSocket announcement to Teacher Portal
    await ws_manager.broadcast_to_teachers({
        "type": "student_submission",
        "exam_id": exam_id,
        "student_id": current_user.id,
        "student_name": current_user.full_name,
        "submitted_at": now.isoformat()
    })

    # Return submission response with score masked if exam is still active
    show_score = (exam.status == "ended")
    return ExamSubmissionResponse(
        id=submission.id,
        exam_id=submission.exam_id,
        student_id=submission.student_id,
        student_name=current_user.full_name,
        score=submission.score if show_score else None,
        total_marks=submission.total_marks if show_score else None,
        percentage=submission.percentage if show_score else None,
        status=submission.status,
        submitted_at=submission.submitted_at
    )


@router.get("/{exam_id}/submissions", response_model=List[ExamSubmissionResponse])
def get_exam_submissions(
    exam_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        subs = db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).all()
        results = []
        for s in subs:
            resp = ExamSubmissionResponse.model_validate(s)
            resp.student_name = s.student.full_name if s.student else "Unknown Student"
            results.append(resp)
        return results
    else:
        # Student receives only their own submission
        sub = db.query(ExamSubmission).filter(
            ExamSubmission.exam_id == exam_id,
            ExamSubmission.student_id == current_user.id
        ).first()
        if not sub:
            return []
        resp = ExamSubmissionResponse.model_validate(sub)
        resp.student_name = current_user.full_name
        # Mask score if exam is still active
        if exam.status != "ended":
            resp.score = None
            resp.total_marks = None
            resp.percentage = None
        return [resp]


# ==========================================
# Feature 2: Browser Tab-Switch Event Ingestion
# ==========================================
@router.post("/{exam_id}/tab-switch")
async def record_tab_switch_event(
    exam_id: str,
    req: Dict[str, Any],
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Ingests browser visibilitychange tab_switch event from authenticated student web client.
    Generates explainable teacher alert, persists event, and broadcasts over WebSocket.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students only")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Validate active exam status
    if exam.status != "active":
        return {"status": "ignored", "message": f"Exam is '{exam.status}'"}

    event_id = req.get("event_id") or secrets.token_hex(16)
    occurred_at_str = req.get("occurred_at")
    occurred_at = datetime.fromisoformat(occurred_at_str) if occurred_at_str else datetime.now(timezone.utc)
    details = req.get("details") or {}
    device_id = req.get("device_id")

    envelope = EventEnvelope(
        event_id=event_id,
        type="activity_event",
        event_type="tab_switch",
        device_id=device_id,
        student_id=current_user.id,
        classroom_id=exam.classroom_id,
        session_id=exam.id,
        mode="exam",
        source="web_client",
        severity="medium",
        occurred_at=occurred_at,
        details={
            **details,
            "student_name": current_user.full_name,
            "student_email": current_user.email,
            "exam_title": exam.title
        }
    )

    event_model, is_new, alert = ingest_event_envelope(db, envelope, raise_on_duplicate=False)
    if is_new and alert:
        await ws_manager.broadcast_alert({
            "id": alert.id,
            "session_id": alert.session_id,
            "student_id": alert.student_id,
            "student_name": current_user.full_name,
            "exam_title": exam.title,
            "device_id": alert.device_id,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "description": alert.description,
            "evidence_summary": alert.evidence_summary,
            "created_at": alert.created_at.isoformat()
        })

    return {
        "status": "recorded",
        "event_id": event_id,
        "alert_triggered": bool(alert)
    }


