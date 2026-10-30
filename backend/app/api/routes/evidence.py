from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import User, ExamSession, Alert, AuditLog
from backend.app.services.cloudinary_service import cloudinary_service

router = APIRouter(prefix="/evidence", tags=["Evidence Media Storage"])


@router.get("/status")
def get_evidence_storage_status(current_user: User = Depends(get_current_user)):
    """
    Returns Cloudinary storage readiness status.
    """
    return {
        "provider": "Cloudinary",
        "configured": cloudinary_service.is_available(),
        "status": "ready" if cloudinary_service.is_available() else "pending_credentials"
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
    Uploads proctor-approved exam evidence screenshot to Cloudinary.
    """
    if not cloudinary_service.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cloudinary storage service is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment."
        )

    # Validate exam exists
    exam = db.query(ExamSession).filter(ExamSession.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam session not found")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Evidence file exceeds 10MB limit")

    try:
        upload_res = cloudinary_service.upload_evidence_screenshot(
            file_bytes=content,
            exam_id=exam_id,
            student_id=current_user.id,
            filename=file.filename
        )

        # If alert_id is provided, attach evidence URL into alert record
        if alert_id:
            alert = db.query(Alert).filter(Alert.id == alert_id).first()
            if alert:
                summary = alert.evidence_summary or {}
                summary["cloudinary_evidence_url"] = upload_res["secure_url"]
                summary["cloudinary_public_id"] = upload_res["public_id"]
                alert.evidence_summary = summary
                db.commit()

        # Audit record
        db.add(AuditLog(
            actor_user_id=current_user.id,
            action="EVIDENCE_UPLOADED",
            target_resource=exam_id,
            details={"public_id": upload_res["public_id"], "alert_id": alert_id}
        ))
        db.commit()

        return {
            "status": "success",
            "secure_url": upload_res["secure_url"],
            "public_id": upload_res["public_id"]
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
