# SATARK – Smart Classroom Integrity & Focus Management Platform

**Team**: WEBFARM  
**Team Members**:
1. Vedant Patil
2. Amol Kumbhar
3. Om Mohite
4. Maruti Shinde

**Architecture**: 100% Local LAN, Completely Offline, Zero Docker, Zero Cloud (No Supabase, No Cloudinary, No LiveKit, No Vercel, No Render)

A unified, ethical smart classroom platform featuring dual policy-driven operational modes: **Exam Mode** (proctored academic assessments with verifiable desktop agent telemetry, browser tab-switch detection, native WebRTC screen monitoring, and server-side auto-grading with PDF report cards) and **Focus Mode** (distraction-free study blocks with Pomodoro intervals, edge vision nudges using OpenCV Haar cascades and Teachable Machine models, and 7-day persisted productivity analytics), alongside an integrated **Online Compiler** and **Class Notes Hub**.

---

## 1. Quick Access Links (Current Active Wi-Fi Network)

> **Active Host IP:** `10.146.60.105`  
> All services run with trusted **HTTPS** and **WSS** enabled on `0.0.0.0` bindings.

| Portal / Service | LAN Direct Link (Any device on Wi-Fi) | Localhost Link (Host PC) |
| :--- | :--- | :--- |
| **Teacher Portal** | [https://10.146.60.105:5174](https://10.146.60.105:5174) | [https://localhost:5174](https://localhost:5174) |
| **Student Portal** | [https://10.146.60.105:5173](https://10.146.60.105:5173) | [https://localhost:5173](https://localhost:5173) |
| **Backend API Docs (Swagger)** | [https://10.146.60.105:8000/docs](https://10.146.60.105:8000/docs) | [https://localhost:8000/docs](https://localhost:8000/docs) |
| **Backend Health Check** | [https://10.146.60.105:8000/health](https://10.146.60.105:8000/health) | [https://localhost:8000/health](https://localhost:8000/health) |
| **WebSocket Engine** | `wss://10.146.60.105:8000/ws` | `wss://localhost:8000/ws` |
| **Android APK Download** | [https://10.146.60.105:8000/download-apk](https://10.146.60.105:8000/download-apk) | [https://localhost:8000/download-apk](https://localhost:8000/download-apk) |

*(Domain aliases `https://satark.test:5174` and `https://satark.local:5174` are also fully supported when mapped via `setup-client.bat` or hosts).*

---

## 2. Core Functional Modules

### A. Exam Mode (Integrity & Proctoring)
- **Teacher Session Control**: Create exams, define security policies, start/pause/resume/conclude exam sessions.
- **Teacher-Centred Native WebRTC Screen Monitoring**: Concurrent student screen shares streamed peer-to-peer using FastAPI WebSockets for signaling (zero Docker, zero LiveKit).
- **Explicit Student Consent**: Students must explicitly approve screen sharing in-browser; a visible red status badge indicates active streaming, and students retain an immediate "Stop Sharing" button.
- **Tab-Switch & Fullscreen Enforcement**: Real-time detection and count of tab changes or window focus loss. Automatically submits or locks out student after policy-configured violations threshold.
- **Server-Side Auto-Grading & PDF Report Cards**: Instant automated scoring of objective submissions, complete with downloadable high-fidelity PDF exam report cards (`reportlab`).
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

### C. Multi-Language Online Code Compiler
- **Integrated Code Editor**: Syntax-highlighted code editor with real-time compilation and execution directly in the Student Portal.
- **Polyglot Execution**: Server-side sandboxed execution for **Python 3**, **JavaScript/Node.js**, **C**, **C++**, and **Java**.
- **Execution Safety & Limits**: Hard resource timeouts, memory bounds, and subprocess monitoring via `psutil`. Supports custom standard input (stdin) passing and structured error output (stdout/stderr).

### D. Digital Class Notes Hub
- **Teacher Material Uploads**: Upload and categorize PDF lecture slides, code repositories, reference sheets, and homework notes by classroom.
- **Student Access & In-Browser Preview**: Students enrolled in classrooms can search, filter, preview, and download study notes directly from their dashboard.

---

## 3. Local LAN Technology Architecture

- **Frontend Monorepo**: Decoupled architecture with **Teacher Portal** (`apps/teacher-portal` on port `5174`), **Student Portal** (`apps/student-portal` on port `5173`), and shared packages (`packages/shared-types`, `shared-api`, `shared-auth`, `shared-ui`).
- **Backend Application Server**: Single authoritative FastAPI server (Python 3.13) bound to `0.0.0.0:8000`.
- **Central Local Database**: SQLite 3 located at `data/satark.db` running in WAL mode (`PRAGMA journal_mode=WAL;`), enforcing foreign keys (`PRAGMA foreign_keys=ON;`), with a 5000ms busy timeout. A schema compatibility view (`CREATE VIEW IF NOT EXISTS profiles AS SELECT * FROM users;`) guarantees full backward compatibility.
- **Trusted HTTPS PKI Engine**: Automated Local Root CA and TLS server certificate generation (`scripts/generate_certs.py`) with dynamic SAN discovery covering local IP addresses (`10.146.60.105`), `satark.local`, `satark.test`, and `localhost`. Enables cross-device browser permissions for WebRTC screen sharing without security blocks.
- **Local Identity & Authentication**: Local password hashing via `passlib[bcrypt]` and HS256 JWT tokens. No external auth provider dependencies.
- **Signaling & Real-Time Hub**: Native WebSockets (`/ws/events`, `/ws/agent`, `/ws/webrtc`) and Teacher-Centred Native WebRTC peer-to-peer star topology.
- **Desktop Agent**: Python 3.13, platform adapters for Windows (`user32` + `psutil`) and Linux (X11 / Wayland), 10-second heartbeat telemetry, local SQLite event queue buffering.
- **Mobile Container**: Single Android application built with Capacitor reusing the student portal frontend (`apps/student-portal/dist`).
- **Ethical & Privacy Manifesto**: Strict visible monitoring with explicit consent. **No keystroke loggers, no hidden surveillance, no password harvesting, no unauthorized recording**.

---

## 4. One-Click Startup & Network Launchers

### Quick Launch on Windows (Host PC):
Double-click `run.bat` or run:
```bat
run.bat
```
*(Or use PowerShell launcher with automatic IP discovery:)*
```powershell
powershell -ExecutionPolicy Bypass -File .\start_satark_lan.ps1
```

### Additional Administrative Scripts:
```powershell
# 1. Setup host PKI certificates and local domain resolution (Admin)
setup-host.bat

# 2. Setup client student PC on the same Wi-Fi (Admin on client)
setup-client.bat 10.146.60.105

# 3. macOS / Linux client setup
./setup-mac.sh 10.146.60.105

# 4. Check system status, running processes, ports, and SQLite database
powershell -ExecutionPolicy Bypass -File .\scripts\status-satark.ps1

# 5. Cleanly stop all SATARK background services
powershell -ExecutionPolicy Bypass -File .\scripts\stop-satark.ps1
```

---

## 5. Evaluation & Demo Accounts

| Role | Email | Password | Full Name | Associated Data |
| :--- | :--- | :--- | :--- | :--- |
| **Teacher (Default)** | `teacher@smartclassroom.edu` | `Password123!` | Prof. Robert Langdon | Classrooms: CS-401 & AI-302, Active Exam: CS401M |
| **Student 1 (Default)**| `alice@smartclassroom.edu` | `Password123!` | Alice Johnson | Enrolled in CS-401, Paired to Windows workstation |
| **Student 2** | `bob@smartclassroom.edu` | `Password123!` | Bob Smith | Enrolled in CS-401, Paired to Ubuntu workstation |
| **Student 3** | `charlie@smartclassroom.edu` | `Password123!` | Charlie Davis | Enrolled in CS-401 |
| **Student 4** | `vedantpatil513@gmail.com` | `Password123!` | Vedant Patil | Active candidate account |

- **Classroom Join PIN**: `CS401X`
- **Active Exam PIN**: `CS401M`
- **Teacher Provisioning Key**: `TEACHER-SECURE-KEY-2026`

---

## 6. Local Administrative CLI

SATARK provides an offline administrative CLI (`backend.app.cli`):

```powershell
# Provision a new Teacher Administrator account securely:
backend/venv/Scripts/python -m backend.app.cli create-teacher --email "prof.satark@local.lan" --name "Prof. Robert Langdon" --password "TeacherSecure123!"

# Reset password for any account:
backend/venv/Scripts/python -m backend.app.cli reset-password --email "student@smartclassroom.edu" --password "NewPassword123!"

# Backup the central SQLite database:
backend/venv/Scripts/python -m backend.app.cli backup-db

# Check database WAL status and table count:
backend/venv/Scripts/python -m backend.app.cli db-status
```

---

## 7. Desktop Monitoring Agent Setup

1. Student logs in to the Student Portal (`https://10.146.60.105:5173`).
2. Click **"Pair Desktop Agent"** in the top banner.
3. Note the single-use 6-character pairing code (e.g., `8K2NP4`).
4. In student terminal:
   ```bash
   python -m desktop-agent.src.main --host 10.146.60.105 --port 8000 --pairing-code 8K2NP4
   ```
5. The workstation immediately connects, streams heartbeats, and shows as **Connected** in the Teacher's Device Grid (`/teacher/devices`).

---

## 8. Automated Test Suites & Verification

```powershell
# Run backend test suite (database, compiler, notes, PDF generation, exam lockouts, WebRTC)
backend/venv/Scripts/python -m pytest backend/tests/ -v

# Run desktop agent tests
backend/venv/Scripts/python -m pytest desktop-agent/tests/ -v

# Frontend production builds
npm run build:teacher
npm run build:student
npm run build
```

---

## 9. Android Mobile Client (Capacitor)

- **Debug APK Location**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Web Download URL**: `https://10.146.60.105:8000/download-apk`
- **LAN Connection**: Tap **"Configure LAN Server Connection"** on the mobile login screen to enter `https://10.146.60.105:8000` or scan the QR code from the Teacher Portal.
