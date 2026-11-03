import uuid
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import (
    APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher, require_student
from backend.app.core.security import decode_access_token
from backend.app.models import User, Classroom, ClassroomEnrollment, ClassNote
from backend.app.schemas import ClassNoteResponse, ClassNoteUpdate
from backend.app.services.class_notes_storage import class_notes_storage

router = APIRouter(tags=["Class Notes & Study Materials"])


def authenticate_user_from_header_or_query(
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Authenticates user from standard Authorization Bearer header,
    with query-parameter ?token= fallback for browser media preview/download windows.
    """
    raw_token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]
    elif token:
        raw_token = token

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(raw_token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )
    return user


def verify_classroom_teacher(classroom_id: str, user: User, db: Session) -> Classroom:
    """Ensure user is a teacher and owns the classroom."""
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    if user.role != "teacher":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only teachers can manage class notes")

    if classroom.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this classroom")

    return classroom


def verify_classroom_access(classroom_id: str, user: User, db: Session):
    """
    Verifies user has access to classroom.
    Returns (classroom, is_teacher)
    """
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    if user.role == "teacher":
        if classroom.teacher_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this classroom")
        return classroom, True
    else:
        # Check student enrollment
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == classroom_id,
            ClassroomEnrollment.student_id == user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not enrolled in this classroom")
        return classroom, False


def format_note_response(note: ClassNote, classroom: Optional[Classroom] = None) -> ClassNoteResponse:
    cls = classroom or note.classroom
    return ClassNoteResponse(
        id=str(note.id),
        classroom_id=str(note.classroom_id),
        classroom_title=cls.title if cls else None,
        classroom_subject_code=cls.subject_code if cls else None,
        teacher_id=str(note.teacher_id),
        teacher_name=note.teacher.full_name if note.teacher else None,
        title=note.title,
        description=note.description,
        subject=note.subject or (cls.subject_code if cls else None),
        category=note.category,
        original_filename=note.original_filename,
        file_size_bytes=note.file_size_bytes,
        mime_type=note.mime_type,
        file_extension=note.file_extension,
        is_published=note.is_published,
        download_count=note.download_count,
        created_at=note.created_at,
        updated_at=note.updated_at,
        download_url=f"/api/v1/notes/{note.id}/download",
        preview_url=f"/api/v1/notes/{note.id}/preview"
    )


# ==========================================
# Teacher Endpoints: Upload & Management
# ==========================================

@router.post("/classrooms/{classroom_id}/notes", response_model=ClassNoteResponse, status_code=status.HTTP_201_CREATED)
async def upload_class_note(
    classroom_id: str,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    category: Optional[str] = Form("Lecture Notes"),
    is_published: bool = Form(True),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Teacher uploads a single study material file with metadata to a managed classroom.
    """
    classroom = verify_classroom_teacher(classroom_id, current_user, db)

    content = await file.read()
    note_id = str(uuid.uuid4())

    storage_res = class_notes_storage.save_note_file(
        file_bytes=content,
        classroom_id=classroom_id,
        note_id=note_id,
        original_filename=file.filename or "untitled_note",
        content_type=file.content_type
    )

    clean_subject = subject or classroom.subject_code or "General"
    clean_category = category or "Lecture Notes"

    new_note = ClassNote(
        id=note_id,
        classroom_id=classroom_id,
        teacher_id=current_user.id,
        title=title.strip(),
        description=description.strip() if description else None,
        subject=clean_subject.strip(),
        category=clean_category.strip(),
        original_filename=storage_res["original_filename"],
        stored_filename=storage_res["stored_filename"],
        relative_path=storage_res["relative_path"],
        file_size_bytes=storage_res["file_size_bytes"],
        mime_type=storage_res["mime_type"],
        file_extension=storage_res["file_extension"],
        is_published=is_published,
        download_count=0
    )

    db.add(new_note)
    db.commit()
    db.refresh(new_note)

    return format_note_response(new_note, classroom)


@router.post("/classrooms/{classroom_id}/notes/batch", response_model=List[ClassNoteResponse], status_code=status.HTTP_201_CREATED)
async def upload_multiple_class_notes(
    classroom_id: str,
    files: List[UploadFile] = File(...),
    category: Optional[str] = Form("Lecture Notes"),
    subject: Optional[str] = Form(None),
    is_published: bool = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Teacher uploads multiple study material documents in a single batch.
    """
    classroom = verify_classroom_teacher(classroom_id, current_user, db)

    clean_subject = subject or classroom.subject_code or "General"
    clean_category = category or "Lecture Notes"
    created_notes = []

    for f in files:
        content = await f.read()
        note_id = str(uuid.uuid4())
        filename = f.filename or "document"

        # Derived title from filename
        derived_title = Path(filename).stem.replace("_", " ").replace("-", " ").title()

        storage_res = class_notes_storage.save_note_file(
            file_bytes=content,
            classroom_id=classroom_id,
            note_id=note_id,
            original_filename=filename,
            content_type=f.content_type
        )

        note = ClassNote(
            id=note_id,
            classroom_id=classroom_id,
            teacher_id=current_user.id,
            title=derived_title,
            description=None,
            subject=clean_subject,
            category=clean_category,
            original_filename=storage_res["original_filename"],
            stored_filename=storage_res["stored_filename"],
            relative_path=storage_res["relative_path"],
            file_size_bytes=storage_res["file_size_bytes"],
            mime_type=storage_res["mime_type"],
            file_extension=storage_res["file_extension"],
            is_published=is_published,
            download_count=0
        )
        db.add(note)
        created_notes.append(note)

    db.commit()
    for note in created_notes:
        db.refresh(note)

    return [format_note_response(n, classroom) for n in created_notes]


# ==========================================
# Classroom Notes Listing (Role-Scoped)
# ==========================================

@router.get("/classrooms/{classroom_id}/notes", response_model=List[ClassNoteResponse])
def list_classroom_notes(
    classroom_id: str,
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lists notes in a classroom:
    - Teachers see all notes (published & draft).
    - Students see only published notes for classes they are enrolled in.
    Supports filtering by keyword search, category, and subject.
    """
    classroom, is_teacher = verify_classroom_access(classroom_id, current_user, db)

    query = db.query(ClassNote).filter(ClassNote.classroom_id == classroom_id)

    # Students only see published notes
    if not is_teacher:
        query = query.filter(ClassNote.is_published.is_(True))

    if category and category.lower() != "all":
        query = query.filter(ClassNote.category == category)

    if subject and subject.lower() != "all":
        query = query.filter(ClassNote.subject.ilike(f"%{subject}%"))

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                ClassNote.title.ilike(search_filter),
                ClassNote.description.ilike(search_filter),
                ClassNote.subject.ilike(search_filter),
                ClassNote.original_filename.ilike(search_filter),
            )
        )

    # Order newest first
    notes = query.order_by(ClassNote.created_at.desc()).all()
    return [format_note_response(n, classroom) for n in notes]


# ==========================================
# Single Note Actions: Read, Update, Delete
# ==========================================

@router.get("/notes/{note_id}", response_model=ClassNoteResponse)
def get_note_detail(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    classroom, is_teacher = verify_classroom_access(str(note.classroom_id), current_user, db)

    if not is_teacher and not note.is_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Note is currently unpublished")

    return format_note_response(note, classroom)


@router.patch("/notes/{note_id}", response_model=ClassNoteResponse)
def update_note_metadata(
    note_id: str,
    payload: ClassNoteUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher updates note title, description, subject, category, or publication status.
    """
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    classroom = verify_classroom_teacher(str(note.classroom_id), current_user, db)

    if payload.title is not None:
        note.title = payload.title.strip()
    if payload.description is not None:
        note.description = payload.description.strip() if payload.description else None
    if payload.subject is not None:
        note.subject = payload.subject.strip() if payload.subject else None
    if payload.category is not None:
        note.category = payload.category.strip()
    if payload.is_published is not None:
        note.is_published = payload.is_published

    note.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(note)

    return format_note_response(note, classroom)


@router.post("/notes/{note_id}/replace-file", response_model=ClassNoteResponse)
async def replace_note_file(
    note_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher replaces the file of an existing note with a new document.
    """
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    classroom = verify_classroom_teacher(str(note.classroom_id), current_user, db)

    content = await file.read()
    storage_res = class_notes_storage.save_note_file(
        file_bytes=content,
        classroom_id=str(note.classroom_id),
        note_id=note_id,
        original_filename=file.filename or note.original_filename,
        content_type=file.content_type
    )

    note.original_filename = storage_res["original_filename"]
    note.stored_filename = storage_res["stored_filename"]
    note.relative_path = storage_res["relative_path"]
    note.file_size_bytes = storage_res["file_size_bytes"]
    note.mime_type = storage_res["mime_type"]
    note.file_extension = storage_res["file_extension"]
    note.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(note)

    return format_note_response(note, classroom)


@router.delete("/notes/{note_id}")
def delete_class_note(
    note_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher deletes a study material note and purges its stored files on disk.
    """
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    verify_classroom_teacher(str(note.classroom_id), current_user, db)

    # Purge file on disk
    class_notes_storage.delete_note_files(str(note.classroom_id), note_id)

    db.delete(note)
    db.commit()

    return {"status": "success", "message": "Class note deleted successfully", "note_id": note_id}


# ==========================================
# Preview & Download Endpoints
# ==========================================

@router.get("/notes/{note_id}/preview")
def preview_note_document(
    note_id: str,
    user: User = Depends(authenticate_user_from_header_or_query),
    db: Session = Depends(get_db)
):
    """
    Streams file with Content-Disposition inline for browser viewing (PDF, PNG, JPG, TXT).
    """
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    _, is_teacher = verify_classroom_access(str(note.classroom_id), user, db)
    if not is_teacher and not note.is_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Document unpublished")

    abs_path = class_notes_storage.resolve_absolute_path(note.relative_path)

    # Safe inline disposition
    return FileResponse(
        path=str(abs_path),
        media_type=note.mime_type,
        filename=note.original_filename,
        content_disposition_type="inline"
    )


@router.get("/notes/{note_id}/download")
def download_note_document(
    note_id: str,
    user: User = Depends(authenticate_user_from_header_or_query),
    db: Session = Depends(get_db)
):
    """
    Downloads file as attachment and increments the download counter.
    """
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    _, is_teacher = verify_classroom_access(str(note.classroom_id), user, db)
    if not is_teacher and not note.is_published:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Document unpublished")

    abs_path = class_notes_storage.resolve_absolute_path(note.relative_path)

    # Increment download count
    note.download_count = (note.download_count or 0) + 1
    db.commit()

    return FileResponse(
        path=str(abs_path),
        media_type=note.mime_type,
        filename=note.original_filename,
        content_disposition_type="attachment"
    )


# ==========================================
# Student Aggregated Notes Hub
# ==========================================

@router.get("/notes/student/enrolled", response_model=List[ClassNoteResponse])
def get_student_enrolled_notes(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    classroom_id: Optional[str] = Query(None),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """
    Returns all published notes from all classrooms the student is currently enrolled in.
    Supports filtering by search query, category, or specific classroom.
    """
    # Get all classroom IDs the student is enrolled in
    enrollments = db.query(ClassroomEnrollment.classroom_id).filter(
        ClassroomEnrollment.student_id == current_user.id
    ).all()
    enrolled_class_ids = [str(e[0]) for e in enrollments]

    if not enrolled_class_ids:
        return []

    query = db.query(ClassNote).filter(
        ClassNote.classroom_id.in_(enrolled_class_ids),
        ClassNote.is_published.is_(True)
    )

    if classroom_id and classroom_id in enrolled_class_ids:
        query = query.filter(ClassNote.classroom_id == classroom_id)

    if category and category.lower() != "all":
        query = query.filter(ClassNote.category == category)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                ClassNote.title.ilike(search_filter),
                ClassNote.description.ilike(search_filter),
                ClassNote.subject.ilike(search_filter),
                ClassNote.original_filename.ilike(search_filter),
            )
        )

    notes = query.order_by(ClassNote.created_at.desc()).all()
    return [format_note_response(n) for n in notes]

