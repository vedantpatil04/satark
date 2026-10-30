# SATARK – Smart Classroom Integrity & Focus Management Platform

**Team**: WEBFARM  
**Team Members**:
1. Vedant Patil
2. Amol Khumbar
3. Om Mohite
4. Maruti Shinde

**Architecture**: 100% Local LAN, Completely Offline, Zero Docker, Zero Cloud (No Supabase, No Cloudinary, No LiveKit, No Vercel, No Render)

A unified, ethical smart classroom platform featuring dual policy-driven operational modes: **Exam Mode** (proctored academic assessments with verifiable desktop agent telemetry, browser tab-switch detection, native WebRTC screen monitoring, and server-side auto-grading) and **Focus Mode** (distraction-free study blocks with Pomodoro intervals, edge vision nudges using OpenCV Haar cascades and Teachable Machine models, and 7-day persisted productivity analytics).

---

## 1. Operating Modes Overview

### A. Exam Mode (Integrity & Proctoring)
- **Teacher Session Control**: Create exams, define security policies, start/pause/resume/conclude exam sessions.
- **Teacher-Centred Native WebRTC Screen Monitoring**: Up to 5 concurrent student screen shares streamed peer-to-peer using FastAPI WebSockets for signaling (zero Docker, zero LiveKit).
- **Explicit Student Consent**: Students must explicitly approve screen sharing in-browser, a visible red status badge indicates active streaming, and students retain an immediate "Stop Sharing" button.
- **Device Attestation**: Candidate workstations run a transparent, visible desktop agent connecting via authenticated WebSocket channels.
- **Live Device Grid**: Proctors track connected, disconnected, and inactive student devices in real-time.
- **Explainable Anomaly Alerts**: Policy-driven detection of unauthorized window switches, restricted process execution, or multi-display connections with verifiable timeline evidence.
- **Local Evidence Storage**: Violation snapshots saved directly to host disk (`storage/evidence/`) with MIME validation and path traversal guards (zero Cloudinary).
- **Comprehensive Audit Trail**: Immutable historical timeline for every candidate session saved in central SQLite database (`data/satark.db`).

### B. Focus Mode (Productivity & Distraction Management)
- **Student-Led Study Sessions**: Set study goals, configure Pomodoro work/break intervals.
- **Edge Vision Attention Feedback**: Client-side computer vision models (OpenCV Haar cascades and Teachable Machine models) providing gentle audio/visual nudges when focus lapses.
- **Session Control**: Pause for breaks, resume, and log completed work.
- **Teacher Cohort Visibility**: Teachers can observe active study sessions across classroom divisions.
- **Productivity Analytics**: Historical focus duration, streaks, and distraction patterns persisted across sessions.

---

## 2. Local LAN Technology Architecture

- **Frontend Architecture**: Decoupled monorepo with **Teacher Portal** (`apps/teacher-portal` on port `5174`), **Student Portal** (`apps/student-portal` on port `5173`), and shared packages (`packages/shared-types`, `shared-api`, `shared-auth`, `shared-ui`, `shared-config`).
- **Backend Application Server**: Single authoritative FastAPI server (Python 3.13) bound to `0.0.0.0:8000`.
- **Central Local Database**: SQLite 3 located at `data/satark.db` running in WAL mode (`PRAGMA journal_mode=WAL;`), enforcing foreign keys (`PRAGMA foreign_keys=ON;`), with 5000ms busy timeout. A schema compatibility view (`CREATE VIEW IF NOT EXISTS profiles AS SELECT * FROM users;`) guarantees full backward compatibility.
- **Local Identity & Authentication**: Local password hashing via `passlib[bcrypt]` and HS256 JWT tokens. No Supabase Auth, no remote JWKS dependencies.
- **Signaling & Real-Time Hub**: Native WebSockets (`/ws/events`, `/ws/agent`, `/ws/webrtc`) and Teacher-Centred Native WebRTC peer-to-peer star topology.
- **Desktop Agent**: Python 3.13, platform adapters for Windows (`user32` + `psutil`) and Linux (X11 / Wayland), 10-second heartbeat telemetry, local SQLite event queue buffering.
- **Mobile Container**: Single Android application built with Capacitor reusing the student portal frontend (`apps/student-portal/dist`).
- **Dynamic LAN Server Configuration**: In-app modal with manual host IP entry, latency health check against `/api/v1/health`, localStorage persistence, and QR code for mobile pairing.
- **Ethical & Privacy Manifesto**: Strict visible monitoring with explicit consent. **No keystroke loggers, no hidden surveillance, no password harvesting, no unauthorized recording**.

---

## 3. One-Command LAN Management (Windows Host)

The platform provides dedicated Windows PowerShell scripts in `scripts/`:

```powershell
# 1. Start all SATARK services (Backend, Teacher Portal, Student Portal)
powershell -ExecutionPolicy Bypass -File .\scripts\start-satark.ps1

# 2. Check system status, running processes, ports, and SQLite database
powershell -ExecutionPolicy Bypass -File .\scripts\status-satark.ps1

# 3. Diagnose LAN network interface, port reachability, and firewall
powershell -ExecutionPolicy Bypass -File .\scripts\check-lan.ps1

# 4. Cleanly stop all SATARK background services
powershell -ExecutionPolicy Bypass -File .\scripts\stop-satark.ps1

# 5. Configure Windows Firewall for Private LAN profiles (Admin)
powershell -ExecutionPolicy Bypass -File .\scripts\setup-firewall.ps1
```

### Access URLs (Host LAN IP: e.g. `10.106.76.105`):
- **Teacher Portal**: `http://10.106.76.105:5174` (or `http://localhost:5174`)
- **Student Portal**: `http://10.106.76.105:5173` (or `http://localhost:5173`)
- **Backend API**: `http://10.106.76.105:8000` (or `http://localhost:8000`)
- **Interactive Swagger Docs**: `http://10.106.76.105:8000/docs`

---

## 4. Local Teacher Provisioning & Account Management

SATARK provides an offline administrative CLI (`backend.app.cli`):

```powershell
# Provision a new Teacher Administrator account securely:
python -m backend.app.cli create-teacher --email "prof.satark@local.lan" --name "Prof. Robert Langdon" --password "TeacherSecure123!"

# Reset password for any account:
python -m backend.app.cli reset-password --email "student@smartclassroom.edu" --password "NewPassword123!"

# Backup the central SQLite database:
python -m backend.app.cli backup-db

# Check database WAL status and table count:
python -m backend.app.cli db-status
```

### Default Evaluation Accounts in Database:
| Role | Email | Password | Full Name | Associated Data |
| :--- | :--- | :--- | :--- | :--- |
| **Teacher (Admin)** | `prof.satark@local.lan` | `TeacherSecure123!` | Prof. Robert Langdon | Local Admin CLI provisioned |
| **Teacher** | `teacher@smartclassroom.edu` | `Password123!` | Prof. Robert Langdon | Classrooms: CS-401 & AI-302, Active Exam: CS401M |
| **Student 1** | `alice@smartclassroom.edu` | `Password123!` | Alice Johnson | Enrolled in CS-401, Paired to Windows workstation |
| **Student 2** | `bob@smartclassroom.edu` | `Password123!` | Bob Smith | Enrolled in CS-401, Paired to Ubuntu workstation |

- **Classroom Join PIN**: `CS401X`
- **Active Exam PIN**: `CS401M`
- **Teacher Account Provisioning Key**: `TEACHER-SECURE-KEY-2026`

---

## 5. Desktop Monitoring Agent Setup & Workstation Pairing

The desktop agent connects student workstations to the exam integrity pipeline without storing student passwords or permanent tokens.

### How to Pair and Run:
1. Student logs in to the Student Portal (`http://<HOST_IP>:5173/student/dashboard`).
2. Click **"Pair Desktop Agent"** in the top banner.
3. Note the single-use 6-character pairing code (e.g., `8K2NP4`).
4. In student terminal:
   ```bash
   python -m desktop-agent.src.main --host <HOST_IP> --port 8000 --pairing-code 8K2NP4
   ```
5. The agent establishes an authenticated WebSocket session (`/ws/agent`), begins heartbeats, and starts monitoring active processes.
6. The workstation immediately shows **Connected** in the Teacher's Device Grid (`/teacher/devices`).

---

## 6. Verification & Automated Test Suites

```powershell
# Run backend tests (storage, WAL mode, security, question banks, media)
backend/venv/Scripts/python -m pytest backend/tests/ -v

# Run desktop agent tests
backend/venv/Scripts/python -m pytest desktop-agent/tests/ -v

# Run frontend builds
npm run build:teacher
npm run build:student
npm run build
```

---

## 7. Android Mobile Client (Capacitor)

The mobile client is packaged as a standalone Android APK:
- **Debug APK Location**: `android/app/build/outputs/apk/debug/app-debug.apk` (~16.6 MB).
- **Cleartext Traffic**: Enabled in `AndroidManifest.xml` (`android:usesCleartextTraffic="true"`) for offline Wi-Fi evaluation.
- **LAN Connection**: Tap **"Configure LAN Server Connection"** on the login screen to enter the host IP or scan the QR code displayed on the teacher portal.
