# SATARK — Local Media & Evidence Storage Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Subsystem**: Local Disk Media Service (Cloudinary Replacement)

---

## 1. Overview & Cloudinary Removal

SATARK has completely eliminated Cloudinary and all third-party media hosting services. All violation screenshots, proctoring evidence snapshots, question bank attachments, and report exports are stored directly on the host computer's local file system.

The subsystem is implemented in `backend/app/services/local_storage_service.py` and managed via `backend/app/api/routes/evidence.py`.

---

## 2. Directory Layout

All media assets are compartmentalized within the `storage/` root directory:

```
satark/
  storage/
    evidence/   # Proctoring violation snapshots & alert captures
    uploads/    # User avatars, question attachments, diagram assets
    exports/    # Generated CSV/PDF exam attendance & audit reports
```

All storage subdirectories are automatically initialized at startup by `start-satark.ps1` and `init_db`.

---

## 3. Storage Security & Integrity Safeguards

1. **Path Traversal Guard**: Every file access verifies that the canonical resolved path strictly resides inside the permitted storage directory:
   ```python
   def _is_safe_path(base_dir: Path, target_path: Path) -> bool:
       try:
           target_path.resolve().relative_to(base_dir.resolve())
           return True
       except ValueError:
           return False
   ```
2. **UUID File Naming**: Uploaded files are immediately assigned a unique UUID filename (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`). Original filenames are sanitized to prevent shell injection or directory breakout attacks.
3. **MIME Type Whitelisting**: Strictly permits safe image formats:
   - `image/jpeg`, `image/png`, `image/webp`
   - Executable extensions (`.exe`, `.bat`, `.sh`, `.php`, `.py`) are rejected with `HTTP 400 Bad Request`.
4. **File Size Constraints**: Maximum upload size is enforced at 10 MB per payload.

---

## 4. API Endpoints for Local Media Access

| Endpoint | Method | Authentication | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/evidence/upload` | `POST` | Bearer JWT (Teacher / Student) | Uploads violation snapshot or attachment to local disk |
| `/api/v1/evidence/download/{file_id}` | `GET` | Bearer JWT | Streams the evidence file from local disk with cache headers |
| `/api/v1/evidence/status` | `GET` | Bearer JWT (Teacher) | Reports disk usage, storage path, and total evidence file count |

---

## 5. Maintenance & Disk Usage Management

Proctors can monitor evidence storage consumption directly from the Teacher Portal or by calling `/api/v1/evidence/status`. To archive or prune old evidence:
1. Back up the `storage/evidence/` directory to secondary offline storage.
2. Expired evidence files can be purged while leaving SQLite record metadata intact.

