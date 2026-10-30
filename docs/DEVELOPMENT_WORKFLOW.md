# SATARK Independent Developer Workflow & Monorepo Guide

**Team**: WEBFARM  
**Members**: Vedant Patil, Amol Khumbar, Om Mohite, Maruti Shinde  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  

---

## 1. Team Architecture & Code Ownership

To enable fast parallel development without merge conflicts, the codebase is structured as an npm monorepo with strict domain separation:

```
satark/
|-- apps/
|   |-- teacher-portal/       <-- Primary Owner: Developer A (Teacher Proctoring & Management)
|   `-- student-portal/       <-- Primary Owner: Developer B (Student Exam Experience & Focus)
|
|-- packages/                 <-- Shared Ownership (Requires Team RFC / Sync)
|   |-- shared-api/           <-- REST endpoints, client error handling, HTTP contracts
|   |-- shared-types/         <-- Shared TypeScript interfaces and domain models
|   |-- shared-auth/          <-- Supabase client, AuthProvider, ProtectedRoute
|   |-- shared-ui/            <-- Radix UI components, toasts, dialogs, design tokens
|   `-- shared-config/        <-- Base tsconfig and Tailwind presets
|
|-- backend/                  <-- Core Lead Backend & DevOps Team (FastAPI, Supabase PostgreSQL)
|-- desktop-agent/            <-- Device Monitoring Team (Python Windows/Linux Agent)
|-- browser-extension/        <-- Proctoring Extension Team (Chromium Tab Monitor)
`-- mobile/                   <-- Mobile Team (Capacitor Android wrapper)
```

### Responsibility Matrix

| Scope | Primary Engineer | Secondary Reviewer | Scope Description |
| :--- | :--- | :--- | :--- |
| **Teacher Portal** | Developer A | Developer B | Classrooms, Exams, MCQ builder, Live Proctoring, Alerts, Submissions, WebRTC Screen Viewer. |
| **Student Portal** | Developer B | Developer A | Exam taking, Question timer, Autosave, Tab-switch events, Focus Mode, History, WebRTC Screen Sharer. |
| **Shared Packages** | Joint / Backend Lead | Lead Architect | `@satark/shared-api`, `@satark/shared-types`, `@satark/shared-auth`, `@satark/shared-ui`. |
| **Backend & Cloud** | Backend Lead | All | FastAPI routes, Supabase migrations, WebRTC signaling, WebSocket ticketing. |

---

## 2. Local Setup & Installation

### Prerequisites
- Node.js 18+ & npm 9+
- Python 3.10+
- Access to Supabase Project (`ugsizlimcnxtbzkwficf`)

### Clone & Install Monorepo Dependencies
From the repository root:
```bash
# Install root and workspace dependencies
npm install
```

### Environment Setup
1. **Teacher Portal** (`apps/teacher-portal/.env`):
   ```env
   VITE_SUPABASE_URL=https://ugsizlimcnxtbzkwficf.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   VITE_API_BASE_URL=http://localhost:8000/api/v1
   ```

2. **Student Portal** (`apps/student-portal/.env`):
   ```env
   VITE_SUPABASE_URL=https://ugsizlimcnxtbzkwficf.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   VITE_API_BASE_URL=http://localhost:8000/api/v1
   ```

3. **Backend** (`backend/.env`):
   ```env
   DATABASE_URL=postgresql://postgres.ugsizlimcnxtbzkwficf:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
   SUPABASE_URL=https://ugsizlimcnxtbzkwficf.supabase.co
   SUPABASE_JWKS_URL=https://ugsizlimcnxtbzkwficf.supabase.co/auth/v1/.well-known/jwks.json
   ```

---

## 3. Simultaneous Development Commands

You can run the backend and both frontends simultaneously on isolated ports:

### 1. Start the Shared FastAPI Backend (Port 8000)
```bash
# In terminal 1:
cd backend
venv\Scripts\activate      # On Windows
source venv/bin/activate   # On Linux/macOS
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the Student Portal (Port 5173)
```bash
# In terminal 2:
npm run dev:student
# Serves on: http://localhost:5173
```

### 3. Start the Teacher Portal (Port 5174)
```bash
# In terminal 3:
npm run dev:teacher
# Serves on: http://localhost:5174
```

---

## 4. Independent Build Commands

Both applications build completely independently without requiring the other portal:

```bash
# Build Teacher Portal:
npm run build:teacher
# Or:
cd apps/teacher-portal && npm run build

# Build Student Portal:
npm run build:student
# Or:
cd apps/student-portal && npm run build

# Build Both Portals:
npm run build
```

---

## 5. Branching & Pull Request Process

### Branch Naming Conventions
- `feat/teacher-<feature-name>` (Developer A)
- `feat/student-<feature-name>` (Developer B)
- `fix/<issue-description>`
- `chore/shared-<package-name>` (Joint agreement required)

### Modification Rules for Shared Packages (`packages/*`)
1. **Never make breaking changes** to existing interfaces in `packages/shared-types` without coordinating with the other developer.
2. If a new field is needed, make it optional (`field?: string`) to maintain backward compatibility.
3. When adding an API endpoint in `backend/app/api/routes/`, update `packages/shared-api` and export it cleanly.
4. Run `npm run build` from root to ensure neither frontend is broken by changes in shared packages.

---

## 6. End-to-End Testing Procedure

To verify both portals interact correctly with the live Supabase database and WebSocket server:
1. **Log in as Teacher** on `http://localhost:5174/login`:
   - Credentials: `teacher@smartclassroom.edu` / `Password123!`
   - Create a classroom (note the 6-character Join Code, e.g. `CS401X`).
   - Create an Exam and start the session.
2. **Log in as Student** on `http://localhost:5173/login`:
   - Credentials: `alice@smartclassroom.edu` / `Password123!`
   - Join the classroom using the Join Code.
   - Enter the exam and start answering questions.
3. **Trigger Tab Switch**:
   - As the student, switch browser tabs.
   - Observe immediate alert reception on Teacher Alerts tab on `http://localhost:5174/alerts`.
4. **Trigger Screen Share**:
   - Teacher clicks "Request Screen Stream" on the live proctoring dashboard.
   - Student receives prompt and clicks "Share Screen".
   - Teacher views stream in real-time in `TeacherScreenViewerModal`.

