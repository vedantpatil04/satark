from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import User, ExamSession, Alert, AuditLog
from backend.app.services.local_storage_service import local_storage_service

router = APIRouter(prefix="/evidence", tags=["Evidence Media Storage"])


@router.get("/status")
def get_evidence_storage_status(current_user: User = Depends(get_current_user)):
    """
    Returns local evidence storage readiness status.
    """
    return {
        "provider": "Local Disk Storage",
        "configured": True,
        "status": "ready",
        "storage_mode": "local_filesystem"
    }


@router.post("/upload")
async def upload_evidence_screenshot(
    exam_id: str = Form(...),
    alert_id: str = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Uploads proctor-approved exam evidence screenshot to secure local disk storage.
    """
    # Validate exam exists
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Evidence file exceeds 10MB limit")

    try:
        upload_res = local_storage_service.save_evidence(
            file_bytes=content,
            exam_id=exam_id,
            student_id=current_user.id,
            filename=file.filename,
            content_type=file.content_type
        )

        # If alert_id is provided, attach evidence URL into alert record
        if alert_id:
            alert = db.query(Alert).filter(Alert.id == alert_id).first()
            if alert:
                summary = alert.evidence_summary or {}
                summary["evidence_url"] = upload_res["secure_url"]
                summary["file_id"] = upload_res["file_id"]
                # Keep compatibility keys
                summary["cloudinary_evidence_url"] = upload_res["secure_url"]
                summary["cloudinary_public_id"] = upload_res["file_id"]
                alert.evidence_summary = summary
                db.commit()

        # Audit record
        db.add(AuditLog(
            actor_user_id=current_user.id,
            action="EVIDENCE_UPLOADED_LOCAL",
            target_resource=exam_id,
            details={"file_id": upload_res["file_id"], "alert_id": alert_id}
        ))
        db.commit()

        return {
            "status": "success",
            "secure_url": upload_res["secure_url"],
            "public_id": upload_res["file_id"],
            "file_id": upload_res["file_id"],
            "bytes": upload_res["bytes"]
        }
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/download/{file_id}")
def download_evidence_file(
    file_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Secure evidence download endpoint restricted to authenticated teachers and students.
    """
    res = local_storage_service.resolve_evidence_file(file_id)
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file not found")

    file_path, mime_type = res
    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=file_path.name
    )
