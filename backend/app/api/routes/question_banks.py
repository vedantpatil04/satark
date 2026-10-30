import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import User, QuestionBank, QuestionBankItem, AuditLog
from backend.app.schemas import (
    QuestionBankCreate, QuestionBankUpdate, QuestionBankResponse, QuestionBankDetailResponse,
    QuestionBankItemCreate, QuestionBankItemUpdate, QuestionBankItemResponse,
    QuestionBankDataset, QuestionValidationSummary, ImportDatasetRequest
)
from backend.app.services.audit_service import log_action

router = APIRouter(prefix="/question-banks", tags=["Question Banks & Datasets"])

CANONICAL_SAMPLE_TEMPLATE: Dict[str, Any] = {
    "schemaVersion": "1.0",
    "title": "Computer Science - Operating Systems & Networks",
    "subject": "Computer Science",
    "description": "Standard university semester question bank covering process management and networking protocols.",
    "questions": [
        {
            "externalId": "OS-001",
            "type": "mcq",
            "question": "Which component of an operating system is primarily responsible for CPU scheduling?",
            "options": [
                "File System Manager",
                "Kernel Process Scheduler",
                "Virtual Memory Manager",
                "Device Driver Interface"
            ],
            "correctOptionIndex": 1,
            "marks": 2,
            "negativeMarks": 0,
            "difficulty": "medium",
            "topic": "Process Management",
            "explanation": "The process scheduler in the kernel decides which runnable process is executed by a CPU core."
        },
        {
            "externalId": "NET-002",
            "type": "mcq",
            "question": "What is the transport-layer protocol that provides reliable, connection-oriented data delivery?",
            "options": [
                "UDP (User Datagram Protocol)",
                "IP (Internet Protocol)",
                "TCP (Transmission Control Protocol)",
                "ICMP (Internet Control Message Protocol)"
            ],
            "correctOptionIndex": 2,
            "marks": 2,
            "negativeMarks": 0,
            "difficulty": "easy",
            "topic": "Computer Networks",
            "explanation": "TCP establishes a 3-way handshake and handles sequence acknowledgment and retransmission."
        },
        {
            "externalId": "SEC-003",
            "type": "mcq",
            "question": "In cryptographic examinations, what ensures non-repudiation and integrity of an answer payload?",
            "options": [
                "Digital Signature with Public Key Cryptography",
                "Base64 Encoding",
                "Caesar Cipher",
                "Symmetric XOR Obfuscation"
            ],
            "correctOptionIndex": 0,
            "marks": 3,
            "negativeMarks": 1,
            "difficulty": "hard",
            "topic": "Information Security",
            "explanation": "A digital signature signed with the sender's private key guarantees proof of origin and detects tampering."
        }
    ]
}


def validate_canonical_dataset(data: Dict[str, Any]) -> QuestionValidationSummary:
    errors = []
    valid_questions = []

    # 1. Root structure validation
    schema_version = data.get("schemaVersion")
    if not schema_version or str(schema_version).strip() != "1.0":
        errors.append({
            "field": "schemaVersion",
            "message": f"Unsupported or missing schemaVersion: '{schema_version}'. Must be '1.0'."
        })

    title = data.get("title")
    if not title or not str(title).strip():
        errors.append({"field": "title", "message": "Question bank 'title' is required."})

    subject = data.get("subject")
    if not subject or not str(subject).strip():
        errors.append({"field": "subject", "message": "Question bank 'subject' is required."})

    questions_raw = data.get("questions")
    if not isinstance(questions_raw, list):
        errors.append({"field": "questions", "message": "'questions' must be an array of questions."})
        return QuestionValidationSummary(
            valid=False,
            schema_version=str(schema_version or "1.0"),
            total_questions=0,
            valid_count=0,
            invalid_count=len(errors),
            valid_questions=[],
            errors=errors
        )

    if len(questions_raw) == 0:
        errors.append({"field": "questions", "message": "'questions' array cannot be empty."})
    elif len(questions_raw) > 500:
        errors.append({"field": "questions", "message": f"Dataset exceeds maximum question limit (500 max, received {len(questions_raw)})."})

    # 2. Per-question validation
    seen_external_ids = set()
    for idx, q in enumerate(questions_raw):
        prefix = f"Question [{idx + 1}]"
        q_errors = []

        if not isinstance(q, dict):
            errors.append({"index": idx, "message": f"{prefix} must be a JSON object."})
            continue

        ext_id = q.get("externalId")
        if not ext_id or not str(ext_id).strip():
            q_errors.append("Missing required 'externalId'.")
        else:
            ext_id_str = str(ext_id).strip()
            if ext_id_str in seen_external_ids:
                q_errors.append(f"Duplicate externalId '{ext_id_str}' found in dataset.")
            seen_external_ids.add(ext_id_str)

        q_type = str(q.get("type", "mcq")).lower()
        if q_type != "mcq":
            q_errors.append(f"Unsupported question type '{q_type}'. Only 'mcq' is supported currently.")

        q_text = q.get("question")
        if not q_text or not str(q_text).strip():
            q_errors.append("Question text cannot be empty.")

        options = q.get("options")
        if not isinstance(options, list) or len(options) < 2:
            q_errors.append("Options must be a list of at least 2 distinct choices.")
        else:
            for opt_i, opt in enumerate(options):
                if not str(opt).strip():
                    q_errors.append(f"Option choice #{opt_i + 1} cannot be blank.")

        correct_idx = q.get("correctOptionIndex")
        if correct_idx is None or not isinstance(correct_idx, int):
            q_errors.append("'correctOptionIndex' must be an integer.")
        elif isinstance(options, list) and (correct_idx < 0 or correct_idx >= len(options)):
            q_errors.append(f"'correctOptionIndex' ({correct_idx}) is out of bounds for {len(options)} options.")

        marks = q.get("marks", 1)
        if not isinstance(marks, (int, float)) or marks <= 0:
            q_errors.append("'marks' must be a positive number (minimum 1).")

        neg_marks = q.get("negativeMarks", 0)
        if not isinstance(neg_marks, (int, float)) or neg_marks < 0:
            q_errors.append("'negativeMarks' cannot be negative.")

        diff = str(q.get("difficulty", "medium")).lower()
        if diff not in ("easy", "medium", "hard"):
            q_errors.append(f"Invalid difficulty '{diff}'. Allowed values: 'easy', 'medium', 'hard'.")

        if q_errors:
            errors.append({
                "index": idx,
                "externalId": ext_id or f"index_{idx}",
                "message": f"{prefix}: " + "; ".join(q_errors)
            })
        else:
            valid_questions.append({
                "externalId": str(ext_id).strip(),
                "type": q_type,
                "question": str(q_text).strip(),
                "options": [str(o).strip() for o in options],
                "correctOptionIndex": int(correct_idx),
                "marks": int(marks),
                "negativeMarks": int(neg_marks),
                "difficulty": diff,
                "topic": str(q.get("topic") or "").strip() or None,
                "explanation": str(q.get("explanation") or "").strip() or None,
            })

    is_valid = len(errors) == 0
    return QuestionValidationSummary(
        valid=is_valid,
        schema_version=str(schema_version or "1.0"),
        total_questions=len(questions_raw) if isinstance(questions_raw, list) else 0,
        valid_count=len(valid_questions),
        invalid_count=len(errors),
        valid_questions=valid_questions,
        errors=errors
    )


# ==========================================
# REST API Endpoints
# ==========================================
@router.get("/template")
def get_canonical_template():
    """Returns downloadable sample canonical JSON question dataset."""
    return CANONICAL_SAMPLE_TEMPLATE


@router.post("/validate-json", response_model=QuestionValidationSummary)
def validate_question_dataset(
    payload: Dict[str, Any],
    current_user: User = Depends(require_teacher)
):
    """
    Validates an uploaded JSON dataset against canonical specification without committing to database.
    Provides informative summary and actionable error diagnostics.
    """
    return validate_canonical_dataset(payload)


@router.post("/import-json", response_model=QuestionBankDetailResponse, status_code=status.HTTP_201_CREATED)
def import_question_dataset(
    req: ImportDatasetRequest,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Atomically imports and persists a validated canonical JSON question dataset.
    Creates a new question bank or appends to an existing one owned by the teacher.
    """
    raw_dict = req.dataset.model_dump()
    val_result = validate_canonical_dataset(raw_dict)
    if not val_result.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Dataset validation failed", "errors": val_result.errors}
        )

    now = datetime.now(timezone.utc)
    bank: Optional[QuestionBank] = None

    if req.bank_id:
        bank = db.query(QuestionBank).filter(
            QuestionBank.id == req.bank_id,
            QuestionBank.teacher_id == current_user.id
        ).first()
        if not bank:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target question bank not found")
    else:
        bank_title = (req.title or req.dataset.title).strip()
        bank_subject = (req.subject or req.dataset.subject).strip()
        bank_topic = (req.topic or req.dataset.topic)
        bank_desc = (req.description or req.dataset.description)

        bank = QuestionBank(
            teacher_id=current_user.id,
            title=bank_title,
            subject=bank_subject,
            topic=bank_topic.strip() if bank_topic else None,
            description=bank_desc.strip() if bank_desc else None,
            created_at=now,
            updated_at=now
        )
        db.add(bank)
        db.commit()
        db.refresh(bank)

    # Check existing externalIds in this bank to prevent duplicate imports
    existing_items = db.query(QuestionBankItem).filter(QuestionBankItem.bank_id == bank.id).all()
    existing_ext_ids = {item.external_id for item in existing_items if item.external_id}

    inserted_items = []
    for q in val_result.valid_questions:
        if q["externalId"] in existing_ext_ids:
            continue  # Skip duplicate external_ids gracefully

        item = QuestionBankItem(
            bank_id=bank.id,
            external_id=q["externalId"],
            question_type=q["type"],
            question_text=q["question"],
            options=q["options"],
            correct_option_index=q["correctOptionIndex"],
            marks=q["marks"],
            negative_marks=q["negativeMarks"],
            difficulty=q["difficulty"],
            topic=q["topic"],
            explanation=q["explanation"],
            created_at=now,
            updated_at=now
        )
        db.add(item)
        inserted_items.append(item)
        existing_ext_ids.add(q["externalId"])

    bank.updated_at = now
    db.commit()
    db.refresh(bank)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="QUESTION_BANK_DATASET_IMPORTED",
        actor_user_id=current_user.id,
        target_resource=bank.id,
        ip_address=client_ip,
        details={
            "bank_id": bank.id,
            "title": bank.title,
            "imported_count": len(inserted_items),
            "total_items": len(bank.items)
        }
    )

    items_resp = [QuestionBankItemResponse.model_validate(it) for it in bank.items]
    return QuestionBankDetailResponse(
        id=bank.id,
        teacher_id=bank.teacher_id,
        title=bank.title,
        subject=bank.subject,
        topic=bank.topic,
        description=bank.description,
        item_count=len(bank.items),
        total_marks=sum(it.marks for it in bank.items),
        created_at=bank.created_at,
        updated_at=bank.updated_at,
        items=items_resp
    )


@router.post("", response_model=QuestionBankResponse, status_code=status.HTTP_201_CREATED)
def create_question_bank(
    req: QuestionBankCreate,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    bank = QuestionBank(
        teacher_id=current_user.id,
        title=req.title.strip(),
        subject=req.subject.strip(),
        topic=req.topic.strip() if req.topic else None,
        description=req.description.strip() if req.description else None,
        created_at=now,
        updated_at=now
    )
    db.add(bank)
    db.commit()
    db.refresh(bank)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="QUESTION_BANK_CREATED",
        actor_user_id=current_user.id,
        target_resource=bank.id,
        ip_address=client_ip,
        details={"title": bank.title, "subject": bank.subject}
    )

    resp = QuestionBankResponse.model_validate(bank)
    resp.item_count = 0
    resp.total_marks = 0
    return resp


@router.get("", response_model=List[QuestionBankResponse])
def list_question_banks(
    search: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    query = db.query(QuestionBank).filter(QuestionBank.teacher_id == current_user.id)

    if subject:
        query = query.filter(QuestionBank.subject.ilike(f"%{subject.strip()}%"))
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(QuestionBank.title.ilike(s) | QuestionBank.description.ilike(s) | QuestionBank.topic.ilike(s))

    banks = query.order_by(QuestionBank.updated_at.desc()).all()
    results = []
    for b in banks:
        resp = QuestionBankResponse.model_validate(b)
        resp.item_count = len(b.items)
        resp.total_marks = sum(it.marks for it in b.items)
        results.append(resp)
    return results


@router.get("/{bank_id}", response_model=QuestionBankDetailResponse)
def get_question_bank(
    bank_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    items_resp = [QuestionBankItemResponse.model_validate(it) for it in bank.items]
    return QuestionBankDetailResponse(
        id=bank.id,
        teacher_id=bank.teacher_id,
        title=bank.title,
        subject=bank.subject,
        topic=bank.topic,
        description=bank.description,
        item_count=len(bank.items),
        total_marks=sum(it.marks for it in bank.items),
        created_at=bank.created_at,
        updated_at=bank.updated_at,
        items=items_resp
    )


@router.put("/{bank_id}", response_model=QuestionBankResponse)
def update_question_bank(
    bank_id: str,
    req: QuestionBankUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    if req.title is not None:
        bank.title = req.title.strip()
    if req.subject is not None:
        bank.subject = req.subject.strip()
    if req.topic is not None:
        bank.topic = req.topic.strip() if req.topic else None
    if req.description is not None:
        bank.description = req.description.strip() if req.description else None

    bank.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(bank)

    resp = QuestionBankResponse.model_validate(bank)
    resp.item_count = len(bank.items)
    resp.total_marks = sum(it.marks for it in bank.items)
    return resp


@router.delete("/{bank_id}")
def delete_question_bank(
    bank_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    db.delete(bank)
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="QUESTION_BANK_DELETED",
        actor_user_id=current_user.id,
        target_resource=bank_id,
        ip_address=client_ip
    )
    return {"message": "Question bank deleted successfully"}


@router.get("/{bank_id}/export")
def export_question_bank_as_json(
    bank_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """Exports question bank as canonical standardized JSON dataset."""
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    questions_payload = []
    for idx, it in enumerate(bank.items):
        questions_payload.append({
            "externalId": it.external_id or f"Q-{idx + 1:03d}",
            "type": it.question_type,
            "question": it.question_text,
            "options": it.options,
            "correctOptionIndex": it.correct_option_index,
            "marks": it.marks,
            "negativeMarks": it.negative_marks,
            "difficulty": it.difficulty,
            "topic": it.topic or bank.topic or bank.subject,
            "explanation": it.explanation or ""
        })

    return {
        "schemaVersion": "1.0",
        "title": bank.title,
        "subject": bank.subject,
        "topic": bank.topic or "",
        "description": bank.description or "",
        "questions": questions_payload
    }


# ==========================================
# Question Bank Items Endpoints
# ==========================================
@router.post("/{bank_id}/items", response_model=QuestionBankItemResponse, status_code=status.HTTP_201_CREATED)
def add_question_bank_item(
    bank_id: str,
    req: QuestionBankItemCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    if req.correct_option_index < 0 or req.correct_option_index >= len(req.options):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"correct_option_index {req.correct_option_index} out of bounds for options count {len(req.options)}"
        )

    now = datetime.now(timezone.utc)
    item = QuestionBankItem(
        bank_id=bank.id,
        external_id=req.external_id.strip() if req.external_id else None,
        question_type="mcq",
        question_text=req.question_text.strip(),
        options=req.options,
        correct_option_index=req.correct_option_index,
        marks=req.marks,
        negative_marks=req.negative_marks,
        difficulty=req.difficulty,
        topic=req.topic.strip() if req.topic else None,
        explanation=req.explanation.strip() if req.explanation else None,
        created_at=now,
        updated_at=now
    )
    db.add(item)
    bank.updated_at = now
    db.commit()
    db.refresh(item)
    return item


@router.put("/{bank_id}/items/{item_id}", response_model=QuestionBankItemResponse)
def update_question_bank_item(
    bank_id: str,
    item_id: str,
    req: QuestionBankItemUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    item = db.query(QuestionBankItem).filter(
        QuestionBankItem.id == item_id,
        QuestionBankItem.bank_id == bank_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question item not found")

    if req.options is not None:
        if len(req.options) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must have at least 2 options")
        item.options = req.options

    if req.correct_option_index is not None:
        opts = req.options or item.options
        if req.correct_option_index < 0 or req.correct_option_index >= len(opts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid correct_option_index")
        item.correct_option_index = req.correct_option_index

    if req.question_text is not None:
        item.question_text = req.question_text.strip()
    if req.external_id is not None:
        item.external_id = req.external_id.strip() if req.external_id else None
    if req.marks is not None:
        item.marks = max(1, req.marks)
    if req.negative_marks is not None:
        item.negative_marks = max(0, req.negative_marks)
    if req.difficulty is not None:
        item.difficulty = req.difficulty
    if req.topic is not None:
        item.topic = req.topic.strip() if req.topic else None
    if req.explanation is not None:
        item.explanation = req.explanation.strip() if req.explanation else None

    item.updated_at = datetime.now(timezone.utc)
    bank.updated_at = item.updated_at
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{bank_id}/items/{item_id}")
def delete_question_bank_item(
    bank_id: str,
    item_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    bank = db.query(QuestionBank).filter(
        QuestionBank.id == bank_id,
        QuestionBank.teacher_id == current_user.id
    ).first()
    if not bank:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question bank not found")

    item = db.query(QuestionBankItem).filter(
        QuestionBankItem.id == item_id,
        QuestionBankItem.bank_id == bank_id
    ).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question item not found")

    db.delete(item)
    bank.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Question item deleted successfully"}

