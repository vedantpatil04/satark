import io
import secrets
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from fastapi.responses import StreamingResponse
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
    ExamImportQuestionsFromBankRequest, ExamQuestionSnapshotResponse,
    SubmissionReviewResponse, SubmissionQuestionReview,
    GradeAnswerRequest, PublishResultsRequest
)
from backend.app.services.audit_service import log_action
from backend.app.services.event_service import ingest_event_envelope
from backend.app.services.pdf_service import generate_exam_result_pdf
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
# Question Management Endpoints (Feature 1 & 2)
# ==========================================
CANONICAL_EXAM_QUESTIONS_TEMPLATE: Dict[str, Any] = {
    "schemaVersion": "1.0",
    "title": "SATARK Exam Question Dataset",
    "questions": [
        {
            "question_type": "mcq",
            "question_text": "What is the primary function of the transport layer in the OSI model?",
            "options": [
                "Packet Routing",
                "End-to-End Data Delivery & Flow Control",
                "Physical Modulation",
                "Framing"
            ],
            "correct_option_index": 1,
            "marks": 2,
            "explanation": "Transport layer provides reliable host-to-host communication and flow control."
        },
        {
            "question_type": "true_false",
            "question_text": "HTTP is a stateless application-layer protocol.",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "marks": 1,
            "explanation": "HTTP does not retain session state between requests without cookies or tokens."
        },
        {
            "question_type": "multiple_select",
            "question_text": "Which of the following are connectionless or connection-oriented transport protocols? Select all valid TCP/UDP facts.",
            "options": [
                "TCP provides reliable delivery",
                "UDP requires a 3-way handshake",
                "UDP is connectionless",
                "TCP utilizes SYN and ACK flags"
            ],
            "correct_answers": [0, 2, 3],
            "marks": 3,
            "explanation": "TCP is connection-oriented with 3-way handshakes and SYN/ACK; UDP is connectionless without handshakes."
        },
        {
            "question_type": "short_answer",
            "question_text": "What does the acronym 'DNS' stand for?",
            "options": ["Domain Name System"],
            "correct_answers": ["Domain Name System", "Domain Name Server"],
            "marks": 2,
            "explanation": "DNS stands for Domain Name System."
        }
    ]
}


@router.get("/questions/template")
def get_exam_questions_template(current_user: User = Depends(require_teacher)):
    """Returns canonical JSON question dataset template with examples of all 4 supported question types."""
    return CANONICAL_EXAM_QUESTIONS_TEMPLATE


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

    if exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add questions when exam is in '{exam.status}' state. Only draft or scheduled exams can be edited."
        )

    q_type = req.question_type or "mcq"
    options = req.options or []
    correct_idx = req.correct_option_index
    correct_answers = req.correct_answers or []

    # Validation per question type
    if q_type == "mcq":
        if len(options) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MCQ questions must have at least 2 options")
        if correct_idx is None or correct_idx < 0 or correct_idx >= len(options):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="correct_option_index must be a valid option index")
    elif q_type == "true_false":
        if not options or len(options) != 2:
            options = ["True", "False"]
        if correct_idx is None or correct_idx not in (0, 1):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="True/False correct_option_index must be 0 (True) or 1 (False)")
    elif q_type == "multiple_select":
        if len(options) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multiple-select questions must have at least 2 options")
        if not correct_answers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multiple-select questions require at least one correct answer in correct_answers")
        # Validate indices
        valid_indices = []
        for a in correct_answers:
            try:
                idx = int(a)
                if 0 <= idx < len(options):
                    valid_indices.append(idx)
            except (ValueError, TypeError):
                pass
        if not valid_indices:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="correct_answers must contain valid option indices")
        correct_answers = sorted(list(set(valid_indices)))
    elif q_type == "short_answer":
        if not correct_answers and options:
            correct_answers = [options[0]]
        if not correct_answers:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Short-answer questions require an acceptable answer string")

    # Determine order number
    max_order = db.query(ExamQuestion.order_num).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num.desc()).first()
    order_num = (max_order[0] + 1) if max_order else 1
    if req.order_num is not None:
        order_num = req.order_num

    question = ExamQuestion(
        exam_id=exam.id,
        question_text=req.question_text.strip(),
        question_type=q_type,
        options=options,
        correct_option_index=correct_idx,
        correct_answers=correct_answers,
        marks=req.marks,
        order_num=order_num,
        explanation=req.explanation.strip() if req.explanation else None
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
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == exam.classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this examination classroom")

        questions = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
        # Security requirement: NEVER expose correct answers to student question responses until exam ends
        sanitized = []
        show_answers = (exam.status == "ended")
        for q in questions:
            sanitized.append(ExamQuestionResponse(
                id=q.id,
                exam_id=q.exam_id,
                question_text=q.question_text,
                question_type=q.question_type or "mcq",
                options=q.options or [],
                marks=q.marks,
                order_num=q.order_num,
                explanation=q.explanation if show_answers else None,
                correct_option_index=q.correct_option_index if show_answers else None,
                correct_answers=q.correct_answers if show_answers else None,
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
    if req.question_type is not None:
        question.question_type = req.question_type
    if req.options is not None:
        question.options = req.options
    if req.correct_option_index is not None:
        question.correct_option_index = req.correct_option_index
    if req.correct_answers is not None:
        question.correct_answers = req.correct_answers
    if req.marks is not None:
        question.marks = req.marks
    if req.order_num is not None:
        question.order_num = req.order_num
    if req.explanation is not None:
        question.explanation = req.explanation.strip() if req.explanation else None

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


@router.post("/{exam_id}/questions/import-json")
def import_questions_json(
    exam_id: str,
    payload: Any = Body(...),
    preview: Optional[bool] = False,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Validates and optionally imports a JSON question dataset into an exam.
    Supports preview/dry_run mode before actual persistence.
    Accepts either an array of question objects or an object with a 'questions' array.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not preview and exam.status not in ["draft", "scheduled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot import questions when exam is in '{exam.status}' state."
        )

    if isinstance(payload, list):
        questions_raw = payload
    elif isinstance(payload, dict):
        questions_raw = payload.get("questions")
        if questions_raw is None and "question_text" in payload:
            questions_raw = [payload]
    else:
        questions_raw = None

    if not isinstance(questions_raw, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'questions' must be an array of questions.")

    if len(questions_raw) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="'questions' array cannot be empty.")

    errors = []
    valid_questions = []

    for idx, q in enumerate(questions_raw):
        prefix = f"Question #{idx + 1}"
        q_errs = []

        if not isinstance(q, dict):
            errors.append(f"{prefix}: Item must be a JSON object")
            continue

        q_text = str(q.get("question_text") or q.get("question") or "").strip()
        if not q_text:
            q_errs.append("Question text cannot be blank")

        q_type = str(q.get("question_type") or q.get("type") or "mcq").lower()
        if q_type not in ("mcq", "multiple_select", "true_false", "short_answer"):
            q_errs.append(f"Invalid question_type '{q_type}'. Supported: mcq, multiple_select, true_false, short_answer")

        options = q.get("options") or []
        if not isinstance(options, list):
            options = []

        marks = q.get("marks", 1)
        try:
            marks = max(1, int(marks))
        except (ValueError, TypeError):
            marks = 1

        correct_idx = q.get("correct_option_index")
        if correct_idx is None:
            correct_idx = q.get("correctOptionIndex")

        correct_answers = q.get("correct_answers")
        if correct_answers is None:
            correct_answers = q.get("correctAnswers") or []
        if not isinstance(correct_answers, list):
            correct_answers = [correct_answers] if correct_answers is not None else []

        explanation = str(q.get("explanation") or "").strip() or None

        # Type-specific validation
        if q_type == "mcq":
            if len(options) < 2:
                q_errs.append("MCQ requires at least 2 options")
            if correct_idx is None or not isinstance(correct_idx, int) or correct_idx < 0 or correct_idx >= len(options):
                q_errs.append(f"MCQ requires valid correct_option_index between 0 and {len(options) - 1}")
        elif q_type == "true_false":
            if not options or len(options) != 2:
                options = ["True", "False"]
            if correct_idx is None and correct_answers:
                first_ans = str(correct_answers[0]).strip().lower()
                if first_ans in ("true", "t", "yes", "1"):
                    correct_idx = 0
                elif first_ans in ("false", "f", "no", "0"):
                    correct_idx = 1
            if correct_idx is None or correct_idx not in (0, 1):
                q_errs.append("True/False requires correct_option_index of 0 (True) or 1 (False), or correct_answers: ['True'/'False']")
            else:
                correct_answers = ["True" if correct_idx == 0 else "False"]
        elif q_type == "multiple_select":
            if len(options) < 2:
                q_errs.append("Multiple-select requires at least 2 options")
            if not correct_answers:
                q_errs.append("Multiple-select requires correct_answers list of indices")
        elif q_type == "short_answer":
            if not correct_answers and options:
                correct_answers = [str(options[0])]
            if not correct_answers:
                q_errs.append("Short-answer requires at least one acceptable answer string in correct_answers")

        if q_errs:
            errors.append(f"{prefix}: " + "; ".join(q_errs))
        else:
            valid_questions.append({
                "question_text": q_text,
                "question_type": q_type,
                "options": [str(o).strip() for o in options],
                "correct_option_index": int(correct_idx) if correct_idx is not None else None,
                "correct_answers": correct_answers,
                "marks": marks,
                "explanation": explanation
            })

    if preview or errors:
        return {
            "valid": len(errors) == 0,
            "preview_mode": preview,
            "is_preview": preview,
            "total_questions": len(questions_raw),
            "total_valid": len(valid_questions),
            "valid_count": len(valid_questions),
            "error_count": len(errors),
            "errors": errors,
            "questions": valid_questions,
            "preview": valid_questions
        }

    # Persist questions if not preview mode
    max_order = db.query(ExamQuestion.order_num).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num.desc()).first()
    next_order = (max_order[0] + 1) if max_order else 1

    created_questions = []
    now = datetime.now(timezone.utc)
    for vq in valid_questions:
        q_obj = ExamQuestion(
            exam_id=exam.id,
            question_text=vq["question_text"],
            question_type=vq["question_type"],
            options=vq["options"],
            correct_option_index=vq["correct_option_index"],
            correct_answers=vq["correct_answers"],
            marks=vq["marks"],
            order_num=next_order,
            explanation=vq["explanation"],
            created_at=now,
            updated_at=now
        )
        db.add(q_obj)
        created_questions.append(q_obj)
        next_order += 1

    db.commit()
    for q_obj in created_questions:
        db.refresh(q_obj)

    return {
        "valid": True,
        "preview_mode": False,
        "imported_count": len(created_questions),
        "total_questions": len(questions_raw),
        "message": f"Successfully imported {len(created_questions)} questions into exam"
    }


@router.get("/{exam_id}/questions/export-json")
def export_questions_json(
    exam_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Exports all exam questions in standard JSON dataset format."""
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam or exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    questions = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
    q_data = []
    for q in questions:
        q_data.append({
            "order_num": q.order_num,
            "question_type": q.question_type or "mcq",
            "question_text": q.question_text,
            "options": q.options or [],
            "correct_option_index": q.correct_option_index,
            "correct_answers": q.correct_answers or [],
            "marks": q.marks,
            "explanation": q.explanation
        })

    return {
        "schemaVersion": "1.0",
        "exam_title": exam.title,
        "exam_code": exam.exam_code,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_questions": len(q_data),
        "total_marks": sum(q["marks"] for q in q_data),
        "questions": q_data
    }


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
        if req.selected_options is not None:
            answer.selected_options = req.selected_options
        if req.text_answer is not None:
            answer.text_answer = req.text_answer
        answer.answered_at = now
    else:
        answer = StudentAnswer(
            exam_id=exam_id,
            student_id=current_user.id,
            question_id=req.question_id,
            selected_option_index=req.selected_option_index,
            selected_options=req.selected_options or [],
            text_answer=req.text_answer,
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

    if exam.status == "ended":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Examination has concluded; submissions closed")

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
                if a.selected_options is not None:
                    ans_record.selected_options = a.selected_options
                if a.text_answer is not None:
                    ans_record.text_answer = a.text_answer
                ans_record.answered_at = now
            else:
                db.add(StudentAnswer(
                    exam_id=exam_id,
                    student_id=current_user.id,
                    question_id=a.question_id,
                    selected_option_index=a.selected_option_index,
                    selected_options=a.selected_options or [],
                    text_answer=a.text_answer,
                    answered_at=now
                ))
        db.commit()

    # Calculate objective marks on the backend across all 4 question types
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
        if not ans:
            continue

        q_type = q.question_type or "mcq"
        is_correct = False

        if q_type in ("mcq", "true_false"):
            if ans.selected_option_index is not None and ans.selected_option_index == q.correct_option_index:
                is_correct = True
        elif q_type == "multiple_select":
            stu_picks = sorted(list(set(ans.selected_options or [])))
            corr_picks = sorted(list(set(q.correct_answers or [])))
            if stu_picks and stu_picks == corr_picks:
                is_correct = True
        elif q_type == "short_answer":
            stu_text = (ans.text_answer or "").strip().lower()
            accept_list = [str(x).strip().lower() for x in (q.correct_answers or []) if str(x).strip()]
            if not accept_list and q.options:
                accept_list = [str(x).strip().lower() for x in q.options if str(x).strip()]
            if stu_text and stu_text in accept_list:
                is_correct = True

        ans.is_correct = is_correct
        if is_correct:
            ans.marks_awarded = q.marks
            score += q.marks
        else:
            ans.marks_awarded = 0

    percentage = round((score / total_marks * 100), 2) if total_marks > 0 else 0.0
    passing_pct = getattr(exam, "passing_percentage", 40) or 40
    is_passed = (percentage >= passing_pct)

    submission = ExamSubmission(
        exam_id=exam_id,
        student_id=current_user.id,
        score=score,
        total_marks=total_marks,
        percentage=percentage,
        is_passed=is_passed,
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

    # Return submission response with score masked if exam results not published
    show_score = bool(getattr(exam, "is_results_published", False) or exam.status == "ended")
    return ExamSubmissionResponse(
        id=submission.id,
        exam_id=submission.exam_id,
        student_id=submission.student_id,
        student_name=current_user.full_name,
        score=submission.score if show_score else None,
        total_marks=submission.total_marks if show_score else None,
        percentage=submission.percentage if show_score else None,
        is_passed=submission.is_passed if show_score else None,
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
            resp.is_passed = s.is_passed
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
        show_score = bool(getattr(exam, "is_results_published", False))
        if not show_score:
            resp.score = None
            resp.total_marks = None
            resp.percentage = None
            resp.is_passed = None
        else:
            resp.is_passed = sub.is_passed
        return [resp]


@router.get("/{exam_id}/submissions/{submission_id}/review", response_model=SubmissionReviewResponse)
def get_submission_review(
    exam_id: str,
    submission_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns full question-by-question grading review of a candidate's submission.
    Authorized for teachers and the candidate who made the submission (once results are published).
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    sub = db.query(ExamSubmission).filter(
        ExamSubmission.id == submission_id,
        ExamSubmission.exam_id == exam_id
    ).first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if sub.student_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if not getattr(exam, "is_results_published", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Exam results have not been published by your instructor yet."
            )

    questions = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
    answers = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == sub.student_id
    ).all()
    ans_by_q = {a.question_id: a for a in answers}

    question_reviews = []
    for q in questions:
        ans = ans_by_q.get(q.id)
        question_reviews.append(SubmissionQuestionReview(
            question_id=str(q.id),
            question_text=q.question_text,
            question_type=q.question_type or "mcq",
            options=q.options or [],
            marks=q.marks,
            order_num=q.order_num,
            correct_option_index=q.correct_option_index,
            correct_answers=q.correct_answers or [],
            explanation=q.explanation,
            selected_option_index=ans.selected_option_index if ans else None,
            selected_options=ans.selected_options if ans else [],
            text_answer=ans.text_answer if ans else None,
            is_correct=ans.is_correct if ans else False,
            marks_awarded=ans.marks_awarded if ans else 0,
            manual_score=ans.manual_score if ans else None,
            feedback=ans.feedback if ans else None
        ))

    student = db.query(User).filter(User.id == sub.student_id).first()
    student_name = student.full_name if student else "Unknown Student"

    return SubmissionReviewResponse(
        submission_id=str(sub.id),
        exam_id=str(sub.exam_id),
        student_id=str(sub.student_id),
        student_name=student_name,
        score=sub.score,
        total_marks=sub.total_marks,
        percentage=sub.percentage,
        status=sub.status,
        is_passed=sub.is_passed,
        passing_percentage=getattr(exam, "passing_percentage", 40) or 40,
        is_results_published=getattr(exam, "is_results_published", False),
        submitted_at=sub.submitted_at,
        questions=question_reviews
    )


@router.get("/{exam_id}/submissions/{submission_id}/pdf")
def download_exam_submission_pdf(
    exam_id: str,
    submission_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Downloads certified SATARK Result PDF for an exam submission.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    sub = db.query(ExamSubmission).filter(
        ExamSubmission.id == submission_id,
        ExamSubmission.exam_id == exam_id
    ).first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if current_user.role == "teacher":
        if exam.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        if sub.student_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if not getattr(exam, "is_results_published", False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Exam results have not been published by your instructor yet."
            )

    student = db.query(User).filter(User.id == sub.student_id).first()
    student_name = student.full_name if student else "Candidate"
    student_email = student.email if student else "candidate@satark.edu"

    classroom = db.query(Classroom).filter(Classroom.id == exam.classroom_id).first()
    classroom_name = classroom.title if classroom else "Default Classroom"

    questions_orm = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam_id).order_by(ExamQuestion.order_num).all()
    answers_orm = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == sub.student_id
    ).all()

    questions_data = [
        {
            "id": q.id,
            "question_text": q.question_text,
            "question_type": q.question_type or "mcq",
            "marks": q.marks,
            "options": q.options or [],
            "explanation": q.explanation
        }
        for q in questions_orm
    ]

    answers_data = [
        {
            "question_id": a.question_id,
            "selected_option_index": a.selected_option_index,
            "selected_options": a.selected_options or [],
            "text_answer": a.text_answer,
            "is_correct": a.is_correct,
            "marks_awarded": a.marks_awarded,
            "manual_score": a.manual_score,
            "feedback": a.feedback
        }
        for a in answers_orm
    ]

    pass_threshold = getattr(exam, "passing_percentage", 40) or 40
    is_passed = bool(sub.is_passed) if sub.is_passed is not None else (sub.percentage >= pass_threshold)

    pdf_bytes = generate_exam_result_pdf(
        exam_title=exam.title,
        exam_code=exam.exam_code,
        classroom_name=classroom_name,
        duration_minutes=exam.duration_minutes,
        student_name=student_name,
        student_email=student_email,
        submitted_at=sub.submitted_at,
        score=sub.score,
        total_marks=sub.total_marks,
        percentage=sub.percentage,
        is_passed=is_passed,
        passing_percentage=pass_threshold,
        questions=questions_data,
        answers=answers_data
    )

    clean_student_name = "".join(c for c in student_name if c.isalnum() or c in ("-", "_"))
    filename = f"SATARK_Result_{clean_student_name}_{exam.exam_code}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.post("/{exam_id}/publish-results")
async def publish_exam_results(
    exam_id: str,
    req: Optional[PublishResultsRequest] = None,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher action to publish final examination results to students.
    Calculates final scores, percentage, and pass/fail status for all candidate submissions.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if req and req.passing_percentage is not None:
        exam.passing_percentage = req.passing_percentage

    exam.is_results_published = True

    # Re-evaluate pass/fail on all submissions
    submissions = db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).all()
    pass_mark = exam.passing_percentage or 40
    for sub in submissions:
        sub.is_passed = (sub.percentage >= pass_mark)
        sub.status = "graded"

    db.commit()

    # Real-time WebSocket announcement to enrolled students
    await ws_manager.broadcast_to_students({
        "type": "exam_results_published",
        "exam_id": exam_id,
        "title": exam.title,
        "passing_percentage": pass_mark
    })

    log_action(
        db,
        action="EXAM_RESULTS_PUBLISHED",
        actor_user_id=current_user.id,
        target_resource=exam_id,
        details={"total_submissions": len(submissions), "passing_percentage": pass_mark}
    )

    return {
        "status": "success",
        "message": "Results published successfully",
        "is_results_published": True,
        "total_submissions": len(submissions),
        "passing_percentage": pass_mark
    }


@router.put("/{exam_id}/submissions/{submission_id}/answers/{question_id}/grade", response_model=SubmissionReviewResponse)
async def grade_student_answer(
    exam_id: str,
    submission_id: str,
    question_id: str,
    req: GradeAnswerRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher action to evaluate subjective/short-answer question, assign manual marks and qualitative feedback.
    Recalculates submission total score, percentage, and pass/fail status.
    """
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    sub = db.query(ExamSubmission).filter(
        ExamSubmission.id == submission_id,
        ExamSubmission.exam_id == exam_id
    ).first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    question = db.query(ExamQuestion).filter(
        ExamQuestion.id == question_id,
        ExamQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

    if req.manual_score < 0 or req.manual_score > question.marks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Score must be between 0 and maximum question marks ({question.marks})"
        )

    ans = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == sub.student_id,
        StudentAnswer.question_id == question_id
    ).first()

    if not ans:
        # Create blank answer record if candidate left it unattempted
        ans = StudentAnswer(
            exam_id=exam_id,
            submission_id=sub.id,
            student_id=sub.student_id,
            question_id=question_id,
            marks_awarded=req.manual_score,
            manual_score=req.manual_score,
            feedback=req.feedback,
            is_correct=(req.manual_score > 0)
        )
        db.add(ans)
    else:
        ans.manual_score = req.manual_score
        ans.marks_awarded = req.manual_score
        ans.feedback = req.feedback
        ans.is_correct = (req.manual_score > 0)

    db.commit()

    # Recalculate submission score
    all_answers = db.query(StudentAnswer).filter(
        StudentAnswer.exam_id == exam_id,
        StudentAnswer.student_id == sub.student_id
    ).all()

    new_score = sum(a.marks_awarded for a in all_answers)
    new_pct = round((new_score / sub.total_marks * 100), 2) if sub.total_marks > 0 else 0.0
    pass_mark = exam.passing_percentage or 40

    sub.score = new_score
    sub.percentage = new_pct
    sub.is_passed = (new_pct >= pass_mark)
    db.commit()
    db.refresh(sub)

    # Return full review
    return get_submission_review(
        exam_id=exam_id,
        submission_id=submission_id,
        current_user=current_user,
        db=db
    )


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
    is_locked = bool(details.get("is_locked") or req.get("is_locked"))
    switch_count = details.get("tab_switch_number") or req.get("tab_switch_number", 1)

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
        severity="critical" if is_locked else ("high" if switch_count >= 2 else "medium"),
        occurred_at=occurred_at,
        details={
            **details,
            "student_name": current_user.full_name,
            "student_email": current_user.email,
            "exam_title": exam.title,
            "is_locked": is_locked,
            "tab_switch_number": switch_count
        }
    )

    event_model, is_new, alert = ingest_event_envelope(db, envelope, raise_on_duplicate=False)
    if is_new and alert:
        await ws_manager.broadcast_alert({
            "id": alert.id,
            "session_id": alert.session_id,
            "student_id": alert.student_id,
            "student_name": current_user.full_name,
            "student_email": current_user.email,
            "exam_title": exam.title,
            "device_id": alert.device_id,
            "alert_type": alert.alert_type,
            "severity": alert.severity,
            "description": alert.description,
            "evidence_summary": alert.evidence_summary,
            "created_at": alert.created_at.isoformat(),
            "is_locked": is_locked,
            "tab_switch_number": switch_count
        })

    # Direct real-time broadcast to teacher WebSocket
    await ws_manager.broadcast_to_teachers({
        "type": "tab_switch_alert",
        "exam_id": exam.id,
        "student_id": current_user.id,
        "student_name": current_user.full_name,
        "student_email": current_user.email,
        "tab_switch_number": switch_count,
        "is_locked": is_locked,
        "timestamp": occurred_at.isoformat()
    })

    if is_locked:
        await ws_manager.broadcast_to_teachers({
            "type": "student_locked",
            "exam_id": exam.id,
            "student_id": current_user.id,
            "student_name": current_user.full_name,
            "student_email": current_user.email,
            "reason": "tab_switch_limit_exceeded",
            "tab_switch_number": switch_count,
            "timestamp": occurred_at.isoformat()
        })

    return {
        "status": "recorded",
        "event_id": event_id,
        "alert_triggered": bool(alert),
        "is_locked": is_locked,
        "tab_switch_number": switch_count
    }


# ==========================================
# Feature: Student Exam Lock & Re-Admission
# ==========================================
@router.post("/{exam_id}/request-unlock")
async def request_exam_unlock(
    exam_id: str,
    req: Dict[str, Any] = Body(default={}),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student endpoint to request re-admission / exam unlock after being locked out
    due to exceeding maximum tab-switch count.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students can request unlock")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    reason = req.get("reason", "Student requested re-admission after 3 tab switches.")
    tab_count = req.get("tab_switch_number", 3)

    log_action(
        db,
        actor_user_id=current_user.id,
        action="STUDENT_REQUESTED_EXAM_UNLOCK",
        target_resource=exam.id,
        details={
            "student_name": current_user.full_name,
            "student_email": current_user.email,
            "exam_title": exam.title,
            "reason": reason,
            "tab_switch_number": tab_count
        }
    )

    # Broadcast notification to teachers
    await ws_manager.broadcast_to_teachers({
        "type": "student_unlock_requested",
        "exam_id": exam.id,
        "student_id": current_user.id,
        "student_name": current_user.full_name,
        "student_email": current_user.email,
        "exam_title": exam.title,
        "reason": reason,
        "tab_switch_number": tab_count,
        "requested_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "status": "requested",
        "message": "Re-admission request forwarded to your proctor. Awaiting instructor authorization."
    }


@router.post("/{exam_id}/students/{student_id}/unlock")
async def unlock_student_exam(
    exam_id: str,
    student_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Teacher/Proctor endpoint to grant re-admission and unlock a student's exam session.
    """
    if current_user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Instructor authorization required")

    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    target_student = db.query(User).filter(User.id == student_id).first()
    if not target_student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    log_action(
        db,
        actor_user_id=current_user.id,
        action="TEACHER_GRANTED_EXAM_UNLOCK",
        target_resource=student_id,
        details={
            "exam_id": exam.id,
            "exam_title": exam.title,
            "teacher_name": current_user.full_name,
            "student_name": target_student.full_name,
            "student_email": target_student.email
        }
    )

    # 1. Send unlock permission event directly to student
    await ws_manager.send_to_student(student_id, {
        "type": "exam_unlocked",
        "exam_id": exam.id,
        "teacher_id": current_user.id,
        "teacher_name": current_user.full_name,
        "message": f"Instructor {current_user.full_name} has granted permission to resume your assessment."
    })

    # 2. Broadcast confirmation to all teachers
    await ws_manager.broadcast_to_teachers({
        "type": "student_unlocked_confirmed",
        "exam_id": exam.id,
        "student_id": student_id,
        "student_name": target_student.full_name,
        "teacher_id": current_user.id,
        "teacher_name": current_user.full_name,
        "unlocked_at": datetime.now(timezone.utc).isoformat()
    })

    return {
        "status": "unlocked",
        "student_id": student_id,
        "student_name": target_student.full_name,
        "message": f"Student {target_student.full_name} has been granted re-admission to the exam."
    }



