# SATARK — Local Migration Audit & Gap Analysis

**Project**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Team**: WEBFARM (Vedant Patil, Amol Khumbar, Om Mohite, Maruti Shinde)  
**Date**: October 31, 2026  
**Status**: Pre-Migration Audit Complete  

---

## 1. Executive Summary

This document performs an exhaustive audit of all external cloud service dependencies in the SATARK platform and defines the architectural transition to a 100% locally hosted, LAN-accessible deployment.

The target system operates completely offline without internet connectivity on a single Windows host machine, serving multiple teacher and student desktop browsers and Android mobile devices over local Wi-Fi or mobile hotspot.

---

## 2. Inventory of Cloud Services & Replacements

| Cloud Dependency | Purpose in Legacy Architecture | Direct Local Replacement | Status |
| :--- | :--- | :--- | :--- |
| **Supabase PostgreSQL** | Remote database (`DATABASE_URL` pooler on port 6543) | Local SQLite (`data/satark.db`) with WAL mode & foreign keys | **To Replace** |
| **Supabase Auth / JWKS** | Asymmetric ES256 JWT validation, user session listeners | FastAPI native JWT (HS256) + bcrypt/Argon2id password hashing | **To Replace** |
| **@supabase/supabase-js**| Frontend SDK for auth state changes and queries | `@satark/shared-auth` pure local JWT & `authApi` REST calls | **To Remove** |
| **Cloudinary** | Remote evidence image/screenshot storage | Local filesystem storage (`storage/evidence`, `storage/uploads`) | **To Replace** |
| **LiveKit Cloud** | Remote SFU signaling and WebRTC media server | Locally hosted LiveKit SFU via `docker-compose.yml` | **To Deploy** |
| **Vercel** | Frontend static deployment configuration (`vercel.json`) | Local Vite preview / dev servers (`0.0.0.0:5173`, `0.0.0.0:5174`) | **To Remove** |
| **Render** | Backend container hosting (`render.yaml`) | Local Uvicorn server (`0.0.0.0:8000`) on Windows host | **To Remove** |
| **STUN/TURN Cloud** | Google Public STUN (`stun:stun.l.google.com:19302`) | Local LAN WebRTC Direct P2P / Local LiveKit internal ICE | **To Reconfigure** |

---

## 3. Detailed Component Audit

### 3.1. Supabase Runtime Dependencies

#### Identified Files:
1. **Frontend / Packages**:
   - `packages/shared-auth/package.json`: dependency `@supabase/supabase-js`
   - `packages/shared-auth/src/supabase.ts`: Supabase client initialization
   - `packages/shared-auth/src/AuthContext.tsx`: `supabase.auth.onAuthStateChange`, `supabase.auth.signOut`
   - `apps/student-portal/package.json` & `apps/teacher-portal/package.json`: references / lockfile entries
   - `apps/student-portal/vite.config.ts` & `apps/teacher-portal/vite.config.ts`: alias `@/lib/supabase`
   - Legacy files in root `src/lib/supabase.ts` and `src/context/AuthContext.tsx`
2. **Backend**:
   - `backend/app/core/config.py`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`
   - `backend/app/core/security.py`: `_supabase_jwks_client`, `decode_supabase_jwks_token`
   - `backend/app/core/dependencies.py`: auto-provisioning Supabase users on token arrival
   - `backend/app/core/database.py`: PostgreSQL pooler connection parameters
   - `backend/migrations/migrate_sqlite_to_supabase.py`, `001_initial_supabase_schema.sql`
   - `backend/tests/test_supabase_webrtc_security.py`
3. **Environment Files**:
   - Root `.env`, `.env.example`
   - `backend/.env`, `backend/.env.example`
   - `apps/student-portal/.env`, `.env.example`
   - `apps/teacher-portal/.env`, `.env.example`

#### Action Plan:
- Remove `@supabase/supabase-js` from `packages/shared-auth/package.json` and root `package.json`.
- Refactor `AuthContext.tsx` to rely purely on `@satark/shared-api` (`authApi.login`, `authApi.register`, `authApi.getMe`, token in storage).
- Remove Supabase JWKS token decoding from `backend/app/core/security.py`.
- Remove Supabase auto-user provisioning from `backend/app/core/dependencies.py`.
- Preserve existing database records by migrating data into `data/satark.db`.
- Move obsolete Supabase migration scripts into `docs/archive/`.

---

### 3.2. Cloudinary Evidence Storage

#### Identified Files:
- `backend/requirements.txt`: `cloudinary==1.41.0`
- `backend/app/core/config.py`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `backend/app/services/cloudinary_service.py`
- `backend/app/api/routes/evidence.py`: `/evidence/status`, `/evidence/upload`

#### Action Plan:
- Create `backend/app/services/local_storage_service.py` managing disk storage at `storage/evidence/`, `storage/uploads/`, and `storage/exports/`.
- Replace `cloudinary_service` calls in `evidence.py` with `local_storage_service`.
- Provide secure download and streaming endpoints with authorized role checks.
- Remove `cloudinary` from `backend/requirements.txt`.

---

### 3.3. Vercel and Render Deployment Artifacts

#### Identified Files:
- `vercel.json` (root): Vercel SPA rewrites and header cache rules
- `render.yaml` (root): Render web service definition with cloud environment variables

#### Action Plan:
- Safely remove or archive `render.yaml` and `vercel.json` as SATARK is now strictly a local LAN system.
- Standardize all configuration around local `.env` and dynamic LAN host discovery.

---

### 3.4. Database & Persistence Layer

#### Current State:
- A local SQLite database `smart_classroom.db` already exists with 27 users, 10 classrooms, 32 enrollments, 20 questions, and 190 audit logs.
- Safe backups have been created at `data/backups/smart_classroom.db`.

#### Target State:
- SQLite database location: `data/satark.db`.
- WAL (Write-Ahead Logging) mode enabled (`PRAGMA journal_mode=WAL;`).
- Foreign key constraints enabled (`PRAGMA foreign_keys=ON;`).
- Busy timeout set to 5000ms (`PRAGMA busy_timeout=5000;`).
- Teacher provisioning CLI: `python -m backend.app.cli create-teacher`.
- Student registration self-service with strict student role assignment.

---

### 3.5. WebRTC & LiveKit Local Architecture

#### Current State:
- `livekit_service.py` already creates HS256-signed LiveKit tokens.
- Frontend components `StudentScreenShareModal.tsx` and `TeacherExamDetail.tsx` connect via LiveKit SDK.

#### Target State:
- Run official LiveKit SFU via `docker-compose.yml`.
- Ports:
  - `7880`: HTTP signaling / WebSocket
  - `7881`: WebRTC TCP fallback
  - `50000-50050/udp`: WebRTC media ports
- Local keys: `devkey` / `secret` configured in `backend/.env` and `livekit.yaml`.
- Secure context enabled via local HTTPS / mkcert.

---

### 3.6. LAN Network Architecture & Dynamic IP

#### Host Requirements:
- Bind all servers to `0.0.0.0`:
  - FastAPI: `0.0.0.0:8000`
  - Student Portal: `0.0.0.0:5173`
  - Teacher Portal: `0.0.0.0:5174`
  - LiveKit SFU: `0.0.0.0:7880`
- Startup script `scripts/start-satark.ps1` dynamically discovers active LAN IPv4 address and prints accessible endpoints for LAN participants.
- Frontend runtime configuration (`localStorage.getItem("custom_api_server")`) allows client PCs and Android phones to change the server address dynamically without code changes.

---

### 3.7. Android APK Configuration

#### Current State:
- Capacitor configuration in `capacitor.config.ts` has `webDir: "apps/student-portal/dist"` and `cleartext: true`.
- App debug APK exists at `app-debug.apk`.

#### Target State:
- Add a dedicated Server Configuration screen / modal in student and teacher login flows allowing users to set the LAN Host IP and Port, with QR code support.
- Document exact Android LAN connection instructions in `docs/ANDROID_LAN_SETUP.md`.

---

## 4. Migration Execution Plan

1. **Database Setup**: Initialize `data/satark.db` from existing data with WAL mode, foreign keys, and indexes. Add CLI for teacher creation.
2. **Local Storage Service**: Implement `local_storage_service.py` and replace Cloudinary in `evidence.py`.
3. **Local LiveKit**: Create `docker-compose.yml` and `livekit.yaml`.
4. **Remove Supabase from Backend**: Clean up `config.py`, `security.py`, `dependencies.py`, `database.py`.
5. **Remove Supabase from Frontend**: Refactor `packages/shared-auth/src/AuthContext.tsx`, remove `supabase.ts`, uninstall `@supabase/supabase-js`.
6. **Dynamic LAN & Server Config UI**: Build server configuration modal for frontends & mobile.
7. **Local HTTPS & Firewall**: Generate local cert scripts and Windows firewall rules (`scripts/setup-firewall.ps1`).
8. **Automated Scripts**: Implement `start-satark.ps1`, `stop-satark.ps1`, `status-satark.ps1`, `check-lan.ps1`.
9. **Verification & Testing**: Comprehensive testing across all 22 acceptance points.
10. **Documentation**: Finalize all guide documents and migration reports.

