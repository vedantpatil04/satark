# SATARK – Smart Classroom Integrity & Focus Management Platform

**Team**: WEBFARM  
**Team Members**:
1. Vedant Patil
2. Amol Khumbar
3. Om Mohite
4. Maruti Shinde

A unified, ethical smart classroom platform featuring dual policy-driven operational modes: **Exam Mode** (proctored academic assessments with verifiable desktop agent telemetry, browser tab-switch detection, and server-side auto-grading) and **Focus Mode** (distraction-free study blocks with Pomodoro intervals, edge vision nudges, and 7-day persisted productivity analytics).

---

## 1. Operating Modes Overview

### A. Exam Mode (Integrity & Proctoring)
- **Teacher Session Control**: Create exams, define security policies, start/pause/resume/conclude exam sessions.
- **Device Attestation**: Candidate workstations run a transparent, visible desktop agent connecting via authenticated WebSocket channels.
- **Live Device Grid**: Proctors track connected, disconnected, and inactive student devices in real-time.
- **Explainable Anomaly Alerts**: Policy-driven detection of unauthorized window switches, restricted process execution, or multi-display connections with verifiable timeline evidence.
- **Comprehensive Audit Trail**: Immutable historical timeline for every candidate session.

### B. Focus Mode (Productivity & Distraction Management)
- **Student-Led Study Sessions**: Set study goals, configure Pomodoro work/break intervals.
- **Local Attention Feedback**: Lightweight local tracking with gentle audio/visual nudges when focus lapses.
- **Session Control**: Pause for breaks, resume, and log completed work.
- **Teacher Cohort Visibility**: Teachers can observe active study sessions across classroom divisions.
- **Productivity Analytics**: Historical focus duration, streaks, and distraction patterns.

---

## 2. Technology Architecture

- **Frontend**: React 18, Vite 5, TypeScript 5, Tailwind CSS, shadcn/ui (Radix primitives), Lucide React.
- **Backend**: Python 3.13, FastAPI, SQLite 3 with SQLAlchemy 2.0 ORM, native WebSockets.
- **Desktop Agent**: Python 3.13, platform adapters for Windows (`user32` + `psutil`) and Linux (X11 / Wayland), 10-second heartbeat telemetry, local SQLite event queue buffering.
- **Mobile Container**: Single Android application built with Capacitor reusing the unified React web application.
- **Security & Privacy**: Strict visible monitoring with explicit consent. **No keystroke loggers, no hidden surveillance, no password harvesting, no screen recording**.

---

## 3. Quick Start & Execution Guide

### 3.1 Prerequisites
- **Node.js**: v18.0.0+ (Tested with `v22.22.3`)
- **Python**: 3.11+ (Tested with `3.13.3`)
- **Git**: 2.40+

### 3.2 Backend Setup & Startup
```bash
# 1. Activate virtual environment
# Windows:
.\backend\venv\Scripts\activate
# Linux/macOS:
source backend/venv/bin/activate

# 2. Install dependencies (if not already installed)
pip install -r backend/requirements.txt
pip install requests psutil websockets

# 3. Seed Demo Data (Creates test teachers, students, courses, exams, alerts)
$env:PYTHONPATH="."  # On PowerShell (or export PYTHONPATH=. on bash)
python scripts/seed_demo_data.py

# 4. Start FastAPI Backend Server
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Backend API will be running at `http://127.0.0.1:8000` (and `http://<LAN_IP>:8000`).  
Interactive API Docs (Swagger): `http://127.0.0.1:8000/docs`.

### 3.3 Frontend Setup & Startup
In a second terminal window:
```bash
# 1. Install frontend packages
npm install

# 2. Start Vite development server on all network interfaces
npm run dev -- --host 0.0.0.0 --port 5173
```
Frontend Portal will be running at `http://127.0.0.1:5173`.  
Network LAN access: `http://<YOUR_IP>:5173` (e.g. `http://10.106.76.105:5173`).

---

## 4. Demo Evaluation Accounts

| Role | Email | Password | Full Name | Associated Data |
| :--- | :--- | :--- | :--- | :--- |
| **Teacher** | `teacher@smartclassroom.edu` | `Password123!` | Prof. Robert Langdon | Classrooms: CS-401 & AI-302, Active Exam: CS401M |
| **Student 1** | `alice@smartclassroom.edu` | `Password123!` | Alice Johnson | Enrolled in CS-401, Paired to Windows workstation |
| **Student 2** | `bob@smartclassroom.edu` | `Password123!` | Bob Smith | Enrolled in CS-401, Paired to Ubuntu workstation |

- **Classroom Join PIN**: `CS401X`
- **Active Exam PIN**: `CS401M`
- **Teacher Account Provisioning Key**: `TEACHER-SECURE-KEY-2026`

---

## 5. Desktop Monitoring Agent Setup & Pairing

The desktop agent connects student workstations to the exam integrity pipeline without storing student passwords or permanent tokens.

### How to Pair and Run:
1. Student logs in to the Student Portal (`http://localhost:5173/student/dashboard`).
2. Click **"Pair Desktop Agent"** in the top banner.
3. Note the single-use 6-character pairing code (e.g., `8K2NP4`).
4. In terminal:
   ```bash
   python -m desktop-agent.src.main --pairing-code 8K2NP4
   ```
5. The agent establishes an authenticated WebSocket session (`/ws/agent`), begins heartbeats, and starts monitoring active processes.
6. The workstation immediately shows **Connected** in the Teacher's Device Grid (`/teacher/devices`).

---

## 6. Repeatable Demonstration Sequence (A through K)

1. **A. Teacher Creates Classroom**: Teacher navigates to `/teacher/classrooms` and creates "Distributed Systems". Join PIN is generated.
2. **B. Student Joins Classroom**: Student opens `/student/classrooms`, enters the PIN, and enrolls.
3. **C. Student Pairs Workstation**: Student clicks "Pair Desktop Agent", launches `python -m desktop-agent.src.main --pairing-code <CODE>`.
4. **D. Teacher Observes Device Online**: Teacher inspects `/teacher/devices` and verifies workstation shows active heartbeat.
5. **E. Teacher Starts Exam**: Teacher opens `/teacher/exams`, reviews policies, and clicks "Start Exam". Status transitions to `active`.
6. **F. Application Activity Generated**: Student switches to a disallowed process (e.g., Discord or CheatEngine).
7. **G. Teacher Receives Real-Time Alert**: An alert toast pops up instantly on the Teacher Portal via WebSocket.
8. **H. Teacher Acknowledges Alert**: Teacher clicks "Review Center" (`/teacher/reports`), views violation evidence, and enters proctor notes.
9. **I. Teacher Ends Exam**: Teacher concludes examination, sealing the candidate session.
10. **J. Student Launches Focus Mode**: Student opens `/student/focus`, sets a 25-minute Pomodoro goal, and activates study timer with optional webcam gaze guard.
11. **K. Session Synchronized**: Completed session duration and productivity stamina are logged to `/student/history` and `/teacher/focus`.

---

## 7. Automated Testing & Verification

```bash
# Run all automated unit and integration tests (18 test suites)
pytest backend/tests/ desktop-agent/tests/ -v

# Run live system integration test (All 6 core journeys)
python scripts/verify_system_integration.py

# Run TypeScript static analysis
npx tsc --noEmit

# Run production Vite build
npm run build
```

---

## 8. Android Mobile Packaging (Capacitor)

The platform provides a **single unified Android application** serving both Teacher and Student personas. Upon launching the APK, users can sign in as either an Instructor or Student; the app verifies JWT claims against the backend and routes the user into the appropriate mobile portal.

### 8.1 Debug APK Artifact
- **File**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Size**: ~16.6 MB
- **Package ID**: `edu.smartclassroom.app`
- **Target OS**: Android 7.0+ (API Level 24 to 34+)

### 8.2 Building the Android APK
```powershell
# 1. Build optimized web assets and sync into native project
npm run build
npx cap sync android

# 2. Compile Debug APK with Gradle (PowerShell)
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Users\Vedant  Patil\AppData\Local\Android\Sdk"
cd android
.\gradlew.bat assembleDebug
```

### 8.3 Mobile Network Configuration (LAN Testing)
- **Automatic Dynamic Resolution**: When accessing via mobile browser, the app binds dynamically to the host computer's LAN IP (`http://<LAN_IP>:5173`).
- **In-App Mobile Server Setting**: Inside the native Android WebView (`app-debug.apk`), users can tap the **Server Config** gear icon on the home screen to point to the host PC (e.g., `http://10.106.76.105:8000`) and test connectivity via `/health`.
- **Cleartext Traffic**: Enabled in `android/app/src/main/AndroidManifest.xml` (`android:usesCleartextTraffic="true"`) for local Wi-Fi hackathon evaluation without requiring TLS certificates.

---

## 9. Verified Operating System Support

| OS / Environment | Foreground Window Detection | Multi-Monitor Detection | Heartbeat & Connectivity | Offline Event Buffering |
| :--- | :--- | :--- | :--- | :--- |
| **Windows 10 / 11** |  Supported via `user32` + `psutil` |  Supported (`SM_CMONITORS`) |  Supported (WS + REST) |  Supported (`agent_buffer.db`) |
| **Linux (X11)** |  Supported via `xprop` + `/proc` |  Supported via `xrandr` |  Supported (WS + REST) |  Supported (`agent_buffer.db`) |
| **Linux (Wayland)** | ⚠️ Not supported (Graceful fallback) | ⚠️ Generic fallback |  Supported (WS + REST) |  Supported (`agent_buffer.db`) |
| **Android (Mobile)** | N/A (Web & Native Mobile Client) | N/A (Mobile Device Viewport) |  Supported (WS + REST) |  Supported (Client cache) |

---

## 10. Phase Roadmap & Progress

- **Phase 1 (3 Hours Evaluation)**:
  - [x] **Stage 1.1**: Repository Audit & Project Foundation
  - [x] **Stage 1.2**: FastAPI Backend Development
  - [x] **Stage 1.3**: Frontend Dual Portal Unification (`/teacher/*`, `/student/*`)
  - [x] **Stage 1.4**: Desktop Monitoring Agent (Win/Linux)
  - [x] **Stage 1.5**: Core System Integration & End-to-End Validation
  - [x] **Stage 1.6**: Mobile Packaging, Final Testing & Demonstration (MVP Completed)
- **Phase 2 (24 Hours Qualification)**: Stages 2.1 through 2.8. Ready upon instruction `START PHASE 2`.
