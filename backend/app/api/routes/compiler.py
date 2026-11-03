from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user
from backend.app.models import User, PracticeFile
from backend.app.schemas import (
    ExecuteCodeRequest,
    ExecuteCodeResponse,
    CompilerStatusResponse,
    PracticeFileCreate,
    PracticeFileUpdate,
    PracticeFileResponse,
    SampleProgram
)
from backend.app.services.code_executor import execute_code
from backend.app.services.compiler_service import (
    get_health_check,
    get_or_create_default_files,
    SAMPLE_PROGRAMS
)

router = APIRouter(prefix="/compiler", tags=["Compiler & Coding Practice"])


@router.get("/health", response_model=CompilerStatusResponse)
@router.get("/status", response_model=CompilerStatusResponse)
def get_compiler_status():
    """
    Returns health status of local compilers/interpreters on host PC,
    availability detection, Windows setup guides, and genuine isolation limits.
    """
    return get_health_check()


@router.post("/execute", response_model=ExecuteCodeResponse)
def run_code(
    req: ExecuteCodeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Executes student code out-of-process with strict isolation, memory cap,
    CPU timeout, ephemeral sandboxing, and disabled network access.
    """
    result = execute_code(
        language=req.language,
        code=req.code,
        stdin=req.stdin or "",
        timeout_seconds=5.0,
        memory_limit_mb=256
    )
    return result


@router.get("/samples/{language}", response_model=List[SampleProgram])
def get_sample_programs(language: str):
    """
    Returns pre-built useful sample programs for the requested language.
    """
    lang = language.lower()
    if lang not in SAMPLE_PROGRAMS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No samples found for language '{language}'"
        )
    return SAMPLE_PROGRAMS[lang]


@router.get("/files", response_model=List[PracticeFileResponse])
def list_practice_files(
    language: Optional[str] = Query(None, description="Filter files by language: c, cpp, java, python"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists student's practice files. If a language is specified and the student
    has no files yet, automatically seeds default sample files for that workspace.
    """
    if language:
        lang = language.lower()
        if lang not in ["c", "cpp", "java", "python"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported language '{language}'"
            )
        return get_or_create_default_files(db, current_user.id, lang)

    files = (
        db.query(PracticeFile)
        .filter(PracticeFile.user_id == current_user.id)
        .order_by(PracticeFile.updated_at.desc())
        .all()
    )
    return files


@router.post("/files", response_model=PracticeFileResponse, status_code=status.HTTP_201_CREATED)
def create_practice_file(
    req: PracticeFileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a new practice file in the student's language workspace.
    """
    clean_filename = req.filename.strip()
    if not clean_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty"
        )

    # Check duplicate
    existing = (
        db.query(PracticeFile)
        .filter(
            PracticeFile.user_id == current_user.id,
            PracticeFile.language == req.language,
            PracticeFile.filename == clean_filename
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A file named '{clean_filename}' already exists in your {req.language.upper()} workspace"
        )

    # Deactivate current active files in same language
    db.query(PracticeFile).filter(
        PracticeFile.user_id == current_user.id,
        PracticeFile.language == req.language
    ).update({"is_active": False})

    new_file = PracticeFile(
        user_id=current_user.id,
        language=req.language,
        filename=clean_filename,
        code=req.code or "",
        stdin=req.stdin or "",
        is_active=True
    )
    db.add(new_file)
    db.commit()
    db.refresh(new_file)
    return new_file


@router.get("/files/{file_id}", response_model=PracticeFileResponse)
def get_practice_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a single practice file.
    """
    file = (
        db.query(PracticeFile)
        .filter(PracticeFile.id == file_id, PracticeFile.user_id == current_user.id)
        .first()
    )
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return file


@router.put("/files/{file_id}", response_model=PracticeFileResponse)
def update_practice_file(
    file_id: str,
    req: PracticeFileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Updates code, stdin, or filename (rename) of a practice file.
    Used for autosave and manual save.
    """
    file = (
        db.query(PracticeFile)
        .filter(PracticeFile.id == file_id, PracticeFile.user_id == current_user.id)
        .first()
    )
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if req.filename is not None:
        clean_name = req.filename.strip()
        if clean_name and clean_name != file.filename:
            existing = (
                db.query(PracticeFile)
                .filter(
                    PracticeFile.user_id == current_user.id,
                    PracticeFile.language == file.language,
                    PracticeFile.filename == clean_name,
                    PracticeFile.id != file.id
                )
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A file named '{clean_name}' already exists"
                )
            file.filename = clean_name

    if req.code is not None:
        file.code = req.code

    if req.stdin is not None:
        file.stdin = req.stdin

    if req.is_active is True:
        # Mark active and deactivate siblings
        db.query(PracticeFile).filter(
            PracticeFile.user_id == current_user.id,
            PracticeFile.language == file.language,
            PracticeFile.id != file.id
        ).update({"is_active": False})
        file.is_active = True

    file.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(file)
    return file


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_practice_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deletes a practice file. If it was active, marks another file active.
    """
    file = (
        db.query(PracticeFile)
        .filter(PracticeFile.id == file_id, PracticeFile.user_id == current_user.id)
        .first()
    )
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    lang = file.language
    was_active = file.is_active
    db.delete(file)
    db.commit()

    if was_active:
        sibling = (
            db.query(PracticeFile)
            .filter(PracticeFile.user_id == current_user.id, PracticeFile.language == lang)
            .first()
        )
        if sibling:
            sibling.is_active = True
            db.commit()

    return None

