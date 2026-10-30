# SATARK — Infrastructure & Baseline Architecture Audit

**Project**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Team**: WEBFARM (Vedant Patil, Amol Khumbar, Om Mohite, Maruti Shinde)  
**Date**: October 30, 2026  
**Auditor**: Lead Backend Architect, Cloud Infrastructure & Security Engineer  

---

## 1. Executive Summary & Classification Matrix

| Feature / Subsystem | Current State | Target Architecture | Audit Classification |
| :--- | :--- | :--- | :--- |
| **User Authentication** | Custom bcrypt + FastAPI token issuance | Supabase Auth (GoTrue) + JWKS JWT Verification | **WORKING (Migrating to Supabase Auth)** |
| **Identity & Profiles** | SQLite `users` & `student_profiles` | Supabase `auth.users` + `public.profiles` | **WORKING (Schema migration ready)** |
| **Role Authorization** | Strict two-role: `teacher` / `student` | Two-role in `public.profiles` + FastAPI & RLS | **WORKING** |
| **Database Persistence** | SQLite (`smart_classroom.db`) | Supabase PostgreSQL (Managed Transaction Pooler) | **WORKING (SQLite backed up, Postgres ready)** |
| **Real-Time Messaging** | Native WebSockets (`/ws/teacher`, `/ws/student`, `/ws/agent`) | Native WebSockets + WSS on Render + WebRTC Signaling | **WORKING** |
| **Device Agent Auth** | Device-scoped HMAC/JWT token + 6-char pairing code | Isolated Device Tokens + Revocation (no user password) | **WORKING** |
| **WebRTC Media Sharing** | Initial experimental eye tracking / vision | 1-to-1 WebRTC Screen Sharing (Teacher ↔ Student) | **PARTIALLY WORKING / READY FOR SIGNALING** |
| **Static Evidence Storage** | Local dev storage in event details JSON | Cloudinary Signed Uploads & Storage | **NOT IMPLEMENTED (Targeting Cloudinary)** |
| **Browser Extension** | Manifest V3 (service worker, content script, popup) | Manifest V3 reporting tab switch / forbidden sites | **WORKING** |
| **Android / Capacitor** | Capacitor 8.6.0 + Android SDK build (49.8 MB debug APK) | Capacitor with configurable API URL override | **WORKING** |
| **Frontend Deployment** | Local Vite dev server on port 5173 | Vercel SPA Deployment (`vercel.json` rewrites) | **NOT IMPLEMENTED (Configuring Vercel)** |
| **Backend Deployment** | Local Uvicorn server on port 8000 | Render Web Service (`render.yaml`, `0.0.0.0:$PORT`) | **NOT IMPLEMENTED (Configuring Render)** |

---

## 2. In-Depth Subsystem Audits

### 2.1 Current Authentication Flow
* **Current Implementation**: Endpoints `/api/v1/auth/register`, `/api/v1/auth/login`, and `/api/v1/auth/me` are implemented in `backend/app/api/routes/auth.py`. Passwords hashed with bcrypt (rounds=12).
* **Role Gating**: Registration defaults strictly to `student`. Creation of a `teacher` account requires the server-side `TEACHER_PROVISIONING_KEY`.
* **State Management**: Frontend stores `auth_token` in `localStorage` through `src/context/AuthContext.tsx`.
* **Migration Target**: Supabase Auth client (`@supabase/supabase-js`) handles sign-in/up; JWT tokens forwarded to FastAPI as `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`. User profiles synced into `public.profiles`.

### 2.2 Current JWT Implementation
* **Current Implementation**: PyJWT signs HS256 tokens using a server-side `SECRET_KEY`.
* **Vulnerability & Obsolescence**: Symmetric secret sharing is insecure when transitioning to cloud identity.
* **Migration Target**: Verify Supabase access tokens using asymmetric signing keys fetched from:
  `https://ugsizlimcnxtbzkwficf.supabase.co/auth/v1/.well-known/jwks.json`.
  Validate `iss`, `aud`, `exp`, `sub`, and match against `public.profiles` for authoritative role resolution.

### 2.3 Current SQLite Database Schema
* **File & Backup**: `smart_classroom.db` (397 KB, 15 tables). Backed up safely to `smart_classroom_backup_phase2.db`.
* **Tables Audited**:
  - `users` (26 records)
  - `student_profiles` (2 records)
  - `classrooms` (10 records)
  - `classroom_enrollments` (32 records)
  - `devices` (6 records)
  - `device_sessions` (0 records)
  - `exam_sessions` (6 records)
  - `exam_questions` (20 records)
  - `exam_submissions` (3 records)
  - `student_answers` (11 records)
  - `focus_sessions` (16 records)
  - `activity_events` (16 records)
  - `alerts` (10 records)
  - `notifications` (2 records)
  - `audit_logs` (183 records)
* **Migration Target**: Supabase PostgreSQL with UUID primary keys, JSONB for dynamic payloads, timestamp with timezone, and foreign keys referencing `auth.users(id)` and `public.profiles(id)`.

### 2.4 Existing SQLAlchemy Models and Relationships
* **Location**: Defined in `backend/app/models/__init__.py`. All models inherit from `declarative_base()`.
* **Foreign Key Tree**: Cleanly mapped with cascade rules (`CASCADE` on enrollments, questions, submissions; `RESTRICT` on exam ownership; `SET NULL` on audit actors and device owners).
* **PostgreSQL Adaptation**: Models use standard types (`String(36)`, `Text`, `Integer`, `Boolean`, `DateTime`, `JSON`). These map natively to PostgreSQL (`UUID`, `TEXT`, `INTEGER`, `BOOLEAN`, `TIMESTAMPTZ`, `JSONB`).

### 2.5 Existing Backend API Contracts
* **Documented in**: `docs/API_CONTRACT.md`.
* **Endpoints**: 34 REST endpoints across `auth`, `classrooms`, `exams`, `devices`, `focus`, `alerts`, `reports`, `notifications`, `audit`.
* **Preservation Guarantee**: All endpoints, payload shapes, and status codes will remain 100% backward-compatible.

### 2.6 Existing WebSocket Channels
* **Endpoints**:
  - `/ws/teacher`: Broadcasts alerts, live candidate status, device state transitions.
  - `/ws/student`: Receives teacher announcements, exam timers, focus nudges.
  - `/ws/agent`: Ingests desktop device heartbeats and foreground process telemetry.
* **Authentication**: Single-use short-lived tickets (`tkt_...`, 60s TTL) generated via `POST /api/v1/auth/ws-ticket`.
* **Signaling Addition**: Will introduce WebRTC signaling messages (`screen_share_request`, `screen_share_accepted`, `screen_share_rejected`, `screen_share_stopped`, `webrtc_offer`, `webrtc_answer`, `ice_candidate`).

### 2.7 Device-Scoped Agent Authentication
* **Isolation**: Desktop agent authenticates via hardware UUID + 6-digit one-time pairing code (`POST /api/v1/devices/pair`).
* **Credentials**: Receives a dedicated, long-lived (30-day) device JWT token containing `{"role": "agent", "device_id": "...", "student_id": "..."}`.
* **Protection**: Device agent has zero access to student or teacher passwords, cannot access other student data, and can be instantly revoked in the Teacher Device Grid.

### 2.8 Notification Delivery
* **In-App**: Real-time notifications pushed over `/ws/teacher` and `/ws/student`.
* **Persisted**: Stored in `notifications` table for asynchronous retrieval.
* **Browser**: Web Notification API alerts proctor upon critical window blur or restricted application detection.

### 2.9 Browser Extension Architecture
* **Manifest**: Manifest V3 compliant (`browser-extension/manifest.json`).
* **Capabilities**: Detects restricted web domains, browser tab changes, window blurs, and reports telemetry envelopes to backend.
* **Status**: Automated test suite passing (`test_extension.py`).

### 2.10 Capacitor Mobile Implementation
* **App ID**: `edu.smartclassroom.app` (configured in `capacitor.config.ts`).
* **Android Artifact**: Debug APK built and hosted (`app-debug.apk`, 49.8 MB).
* **Runtime Dynamic URL**: `src/api/client.ts` supports runtime host overrides via `custom_api_server` for LAN/cloud testing.

### 2.11 Media & Evidence Storage
* **Current State**: Event metadata and text evidence stored in JSON fields (`evidence_summary`).
* **Requirement**: Cloudinary backend integration for uploaded screenshots and proctor evidence captures with signed URLs.

### 2.12 Cloud Deployment Baseline
* **Frontend**: React + Vite (`dist`) -> Deployable to Vercel with SPA routing rewrites.
* **Backend**: FastAPI (`uvicorn backend.app.main:app`) -> Deployable to Render Web Service on `0.0.0.0:$PORT`.

---

## 3. Gap Analysis & Master Execution Roadmap

1. **STAGE B**: Generate Supabase PostgreSQL schema migration script and Alembic migration tracking. Prepare connection logic supporting Supabase Transaction Pooler (`DATABASE_URL`).
2. **STAGE C**: Implement Supabase Auth integration (`@supabase/supabase-js` on frontend, JWKS validation on backend, `public.profiles` synchronization).
3. **STAGE D**: Adapt FastAPI dependencies to accept Supabase access tokens while preserving device-agent tokens.
4. **STAGE E**: Enhance WebSocket connection manager with authorized WebRTC signaling routing.
5. **STAGE F**: Implement WebRTC 1-to-1 screen sharing in Teacher and Student portals.
6. **STAGE G**: Implement Cloudinary evidence storage service in backend.
7. **STAGE H**: Create `vercel.json` and `render.yaml` deployment configurations with environment templates.
8. **STAGE I**: Run comprehensive automated test suite and produce deployment verification report.
