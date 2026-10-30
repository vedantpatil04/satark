import logging
from typing import Optional, Dict, Any
from backend.app.core.config import settings

logger = logging.getLogger("cloudinary_service")

# Initialize Cloudinary if credentials are configured
_is_configured = False
if settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET:
    try:
        import cloudinary
        import cloudinary.uploader
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=True
        )
        _is_configured = True
        logger.info("Cloudinary storage service initialized successfully.")
    except Exception as e:
        logger.warning(f"Could not initialize Cloudinary: {e}")
        _is_configured = False


class CloudinaryEvidenceService:
    @staticmethod
    def is_available() -> bool:
        return _is_configured

    @staticmethod
    def upload_evidence_screenshot(
        file_bytes: bytes,
        exam_id: str,
        student_id: str,
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uploads an approved examination screenshot or incident evidence to Cloudinary with secure tags.
        """
        if not _is_configured:
            raise RuntimeError(
                "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, "
                "and CLOUDINARY_API_SECRET in backend environment."
            )

        import cloudinary.uploader
        folder = f"satark/evidence/{exam_id}"
        public_id = f"{student_id}_{int(file_bytes.__sizeof__())}"
        
        result = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            public_id=public_id,
            resource_type="image",
            tags=["satark_evidence", f"exam_{exam_id}", f"student_{student_id}"],
            overwrite=True
        )

        return {
            "secure_url": result.get("secure_url"),
            "public_id": result.get("public_id"),
            "format": result.get("format"),
            "created_at": result.get("created_at"),
            "bytes": result.get("bytes")
        }

    @staticmethod
    def delete_evidence(public_id: str) -> bool:
        """
        Deletes evidence asset according to data retention policies.
        """
        if not _is_configured:
            return False
        import cloudinary.uploader
        res = cloudinary.uploader.destroy(public_id)
        return res.get("result") == "ok"


cloudinary_service = CloudinaryEvidenceService()
