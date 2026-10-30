import os
import uuid
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from backend.app.core.config import settings

# Base storage directories anchored to project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
BASE_STORAGE_DIR = PROJECT_ROOT / "storage"
EVIDENCE_DIR = BASE_STORAGE_DIR / "evidence"
UPLOADS_DIR = BASE_STORAGE_DIR / "uploads"
EXPORTS_DIR = BASE_STORAGE_DIR / "exports"

# Allowed MIME types and extensions
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "application/pdf"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


class LocalStorageService:
    def __init__(self):
        self._ensure_directories()

    def _ensure_directories(self):
        for directory in [EVIDENCE_DIR, UPLOADS_DIR, EXPORTS_DIR]:
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def is_available() -> bool:
        """Local filesystem storage is always available locally."""
        return True

    def save_evidence(
        self,
        file_bytes: bytes,
        exam_id: str,
        student_id: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Saves an exam evidence snapshot locally on disk with path traversal protection,
        MIME/extension validation, and secure UUID namespacing.
        """
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB")

        # Determine extension
        ext = ".png"
        if filename:
            parsed_ext = Path(filename).suffix.lower()
            if parsed_ext in ALLOWED_IMAGE_EXTENSIONS:
                ext = parsed_ext

        # Validate MIME type
        guessed_type, _ = mimetypes.guess_type(f"file{ext}")
        effective_mime = content_type or guessed_type or "image/png"
        if effective_mime not in ALLOWED_MIME_TYPES and not effective_mime.startswith("image/"):
            raise ValueError(f"Unsupported file MIME type: {effective_mime}")

        # Path traversal guard for exam_id and student_id
        safe_exam_id = "".join(c for c in str(exam_id) if c.isalnum() or c in "-_")
        safe_student_id = "".join(c for c in str(student_id) if c.isalnum() or c in "-_")

        exam_folder = EVIDENCE_DIR / safe_exam_id
        exam_folder.mkdir(parents=True, exist_ok=True)

        file_id = f"ev_{uuid.uuid4().hex}"
        target_filename = f"{file_id}_{safe_student_id}{ext}"
        destination_path = (exam_folder / target_filename).resolve()

        # Prevent path traversal outside storage directory
        if not destination_path.is_relative_to(EVIDENCE_DIR.resolve()):
            raise ValueError("Invalid destination path: Path traversal attempt detected")

        with open(destination_path, "wb") as f:
            f.write(file_bytes)

        relative_url = f"/api/v1/evidence/download/{file_id}"
        created_at = datetime.now(timezone.utc).isoformat()

        return {
            "file_id": file_id,
            "filename": target_filename,
            "relative_path": str(destination_path.relative_to(PROJECT_ROOT)),
            "secure_url": relative_url,
            "public_id": file_id,
            "format": ext.lstrip("."),
            "bytes": len(file_bytes),
            "content_type": effective_mime,
            "created_at": created_at
        }

    def resolve_evidence_file(self, file_id: str) -> Optional[Tuple[Path, str]]:
        """
        Locates an evidence file on disk by file_id safely.
        Returns (Path, mime_type) if found, else None.
        """
        safe_file_id = "".join(c for c in file_id if c.isalnum() or c in "-_")
        if not safe_file_id:
            return None

        # Search within evidence directory
        matches = list(EVIDENCE_DIR.glob(f"**/{safe_file_id}*"))
        for candidate in matches:
            resolved = candidate.resolve()
            if resolved.is_file() and resolved.is_relative_to(EVIDENCE_DIR.resolve()):
                mime, _ = mimetypes.guess_type(str(resolved))
                return resolved, mime or "application/octet-stream"
        return None

    def delete_evidence(self, file_id: str) -> bool:
        """Deletes an evidence file from disk safely."""
        res = self.resolve_evidence_file(file_id)
        if not res:
            return False
        path, _ = res
        try:
            path.unlink(missing_ok=True)
            return True
        except Exception:
            return False


local_storage_service = LocalStorageService()

