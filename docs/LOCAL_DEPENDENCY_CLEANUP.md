# SATARK — Local Dependency Cleanup & Removal Audit

**Team**: WEBFARM  
**Project**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Date**: October 30, 2026  
**Status**: 100% Complete — Zero Cloud Dependencies in Runtime

---

## 1. Executive Summary

As mandated by the project requirements, SATARK has been completely decoupled from all third-party cloud hosting, proprietary database, cloud-dependent authentication, and commercial real-time media services. The application now operates entirely within a self-hosted Windows Local Area Network (LAN) environment with zero mandatory external internet access.

This document records all cloud dependencies, services, packages, and configuration files that have been removed or archived, along with their local, offline replacements.

---

## 2. Inventory of Removed Cloud Services

| Cloud Service | Former Role | Replacement Architecture | Status |
| :--- | :--- | :--- | :--- |
| **Supabase PostgreSQL** | Cloud database | Central SQLite at `data/satark.db` with WAL mode & foreign keys | **Removed / Replaced** |
| **Supabase Auth / JWKS** | Cloud authentication | Local FastAPI bcrypt password hashing + HS256 JWT tokens | **Removed / Replaced** |
| **Supabase Storage** | Remote file storage | Local disk storage (`storage/evidence/`, `storage/uploads/`) | **Removed / Replaced** |
| **Cloudinary** | Cloud image hosting | Local storage service with MIME validation & traversal guards | **Removed / Replaced** |
| **LiveKit Cloud / Docker** | Remote SFU media server | Native WebRTC peer-to-peer star topology via FastAPI WebSockets | **Removed / Replaced** |
| **Vercel** | Cloud frontend hosting | Local Vite dev/preview server bound to `0.0.0.0` (ports 5174, 5173) | **Archived** |
| **Render** | Cloud backend hosting | Local Uvicorn / FastAPI server bound to `0.0.0.0:8000` | **Archived** |

---

## 3. Package and Dependency Removals

### Python Backend (`backend/requirements.txt`)
- **Removed**:
  - `cloudinary==1.41.0`: Replaced by native Python file I/O in `backend/app/services/local_storage_service.py`.
  - `psycopg2-binary==2.9.9`: PostgreSQL driver no longer required; Python's standard `sqlite3` and SQLAlchemy SQLite dialect are used.
  - `livekit-api`: Eliminated entirely in favor of lightweight Native WebRTC session management (`backend/app/services/webrtc_service.py`).
- **Retained**:
  - `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `python-jose`, `passlib[bcrypt]`, `websockets`, `cryptography`, `pillow`, `opencv-python-headless`.

### Frontend Monorepo (`package.json`, `apps/*/package.json`, `packages/*/package.json`)
- **Removed**:
  - `@supabase/supabase-js`: Removed from root, `packages/shared-auth`, `apps/teacher-portal`, and `apps/student-portal`.
  - `livekit-client`: Removed from root and frontend portals.
- **Retained**:
  - Standard React, Vite, Lucide React, Tailwind CSS, TypeScript, and native browser Web APIs (`RTCPeerConnection`, `getDisplayMedia`, `WebSocket`).

---

## 4. Code & Architecture Refactoring

### 1. Database Layer (`backend/app/core/database.py`)
- Removed remote PostgreSQL connection pooling.
- Configured SQLite with:
  ```python
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  ```
- Created a compatibility view: `CREATE VIEW IF NOT EXISTS profiles AS SELECT * FROM users;` ensuring zero disruption to existing legacy queries while preserving all 21 tables and existing exam data.

### 2. Authentication & Authorization (`backend/app/core/security.py`, `backend/app/core/dependencies.py`)
- Removed Supabase JWKS remote key fetchers (`decode_supabase_jwks_token`).
- Implemented pure local HS256 JWT validation using secret stored in `backend/.env`.
- Implemented `backend/app/cli.py` for offline teacher provisioning:
  ```powershell
  python -m backend.app.cli create-teacher
  python -m backend.app.cli reset-password --email <email>
  python -m backend.app.cli backup-db
  ```
- Added in-memory JWT revocation set (`revoke_token`) for immediate logout invalidation.

### 3. Frontend Authentication Context (`packages/shared-auth/src/AuthContext.tsx`)
- Completely decoupled from Supabase client listeners (`onAuthStateChange`).
- Replaced with local storage token persistence (`satark_token`, `satark_user`) and immediate token validation against `/api/v1/auth/me`.

### 4. Screen Sharing & Monitoring (`backend/app/services/webrtc_service.py`, `apps/teacher-portal/src/pages/exams/LiveMonitoring.tsx`, `apps/student-portal/src/hooks/useWebRTCStream.ts`)
- Replaced Dockerized LiveKit SFU with a Teacher-Centred Native WebRTC star topology.
- Students connect directly to the teacher's browser via FastAPI WebSocket signaling (`webrtc_offer`, `webrtc_answer`, `ice_candidate`).
- Student privacy protected with explicit prompt confirmation, visible red status badge, and an immediate "Stop Sharing" button.
- Native video downsampled to 720p @ 15fps (800 kbps) for smooth performance across up to 5 concurrent streams on standard 2.4GHz / 5GHz Wi-Fi networks.

---

## 5. Archived Files Location

All former cloud deployment files and legacy migration scripts have been safely moved to `docs/archive/` for historical reference:
- `docs/archive/cloud_deployment/render.yaml`
- `docs/archive/cloud_deployment/root_vercel.json`
- `docs/archive/cloud_deployment/teacher_portal_vercel.json`
- `docs/archive/cloud_deployment/student_portal_vercel.json`
- `docs/archive/supabase.ts`
- `docs/archive/001_initial_supabase_schema.sql`
- `docs/archive/migrate_sqlite_to_supabase.py`
- `docs/archive/cloudinary_service.py`

---

## 6. Verification & Proof of Zero Cloud Dependencies

1. **Static Codebase Audit**: A repository-wide regex search confirms zero active references to `@supabase/supabase-js`, `CLOUDINARY_*`, `LIVEKIT_*`, or remote PostgreSQL connections in application runtime paths.
2. **Network Isolation**: When tested with the host's Wi-Fi disconnected from the internet (operating on an isolated offline router or phone hotspot), SATARK:
   - Starts all services cleanly via `.\scripts\start-satark.ps1`.
   - Allows teacher and student authentication with zero cloud timeouts.
   - Saves evidence files directly to local disk (`storage/evidence/`).
   - Streams screen video across LAN peers via native WebSockets and `RTCPeerConnection`.
   - Performs automated MCQ evaluations and records audit logs to `data/satark.db`.

