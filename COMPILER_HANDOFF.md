# SATARK Compiler & Coding Practice — Feature Handoff Documentation

## 1. Feature Overview & Architecture

The **Compiler & Coding Practice** section is a dedicated, offline-ready candidate workspace within the SATARK Student Portal. It allows students to write, compile, debug, and execute code in **C (GCC)**, **C++ (G++)**, **Java (OpenJDK)**, and **Python 3** over the local area network (LAN) without installing any compilers or development tools on their client devices.

### Architecture Highlights
- **Client-Side:** Modern CodeMirror 6 code editor with One Dark theme, line numbers, syntax highlighting, bracket pairing, auto-indentation, and tab handling. Communicates with the backend exclusively via standard REST API endpoints.
- **Backend Service:** FastAPI REST endpoints (`/api/v1/compiler/*`) handling runtime availability detection, ephemeral sandboxed execution, and practice workspace persistence.
- **Execution Isolation:** Student code is **never executed within FastAPI**. Each run spawns an isolated out-of-process worker subprocess governed by native **Windows Job Objects** (256 MB memory cap, process limit), hard **5.0-second timeouts** with recursive child process termination (`psutil`), ephemeral scratch directories wiped on completion, and disabled network access.
- **Workspace & File Persistence:** Files, custom STDIN inputs, and active editor states are persisted per-student and per-language in local SQLite (`satark.db`), ensuring zero data leakage across student accounts.
- **Complete Exam Independence:** Completely isolated from live examination sessions, question banks, exam timers, and proctoring.

---

## 2. File Manifest & Structure

```text
SATARK_COMPILER_HANDOFF/
│
├── COMPILER_HANDOFF.md                          # Comprehensive handoff documentation
├── run.bat                                      # System launcher configured with backend --reload
│
├── apps/
│   └── student-portal/
│       ├── package.json                         # Student portal dependencies including CodeMirror 6
│       └── src/
│           ├── App.tsx                          # Registered /compiler and /student/compiler routes
│           ├── layouts/
│           │   └── StudentLayout.tsx            # Compiler navigation tab in sidebar and user menu
│           ├── pages/
│           │   └── StudentCompiler.tsx          # Full Compiler & Coding Practice workspace UI
│           └── components/
│               └── compiler/
│                   └── CodeMirrorEditor.tsx     # CodeMirror 6 React component with language extensions
│
├── packages/
│   └── shared-api/
│       └── src/
│           ├── compiler.ts                      # Compiler API client methods and TypeScript types
│           └── index.ts                         # Re-exported compiler API module
│
└── backend/
    ├── app/
    │   ├── main.py                              # FastAPI router registration (/api/v1/compiler)
    │   ├── models/
    │   │   └── __init__.py                      # PracticeFile SQLAlchemy database model
    │   ├── schemas/
    │   │   └── __init__.py                      # Pydantic schemas for compiler execution and files
    │   ├── services/
    │   │   ├── code_executor.py                 # Out-of-process execution engine & isolation
    │   │   └── compiler_service.py              # Runtime detection, setup guides, starter workspaces
    │   └── api/
    │       └── routes/
    │           └── compiler.py                  # REST API endpoints for compiler operations
    └── tests/
        └── test_compiler.py                     # Comprehensive pytest test suite (10 tests)
```

---

## 3. Required Dependencies

### Frontend (npm)
Added to `apps/student-portal/package.json`:
- `@uiw/react-codemirror`: `^4.23.10`
- `@codemirror/lang-python`: `^6.1.7`
- `@codemirror/lang-cpp`: `^6.0.3` (handles both C and C++)
- `@codemirror/lang-java`: `^6.0.1`
- `@codemirror/theme-one-dark`: `^6.1.3`

To install:
```powershell
npm install -w @satark/student-portal @uiw/react-codemirror @codemirror/lang-python @codemirror/lang-cpp @codemirror/lang-java @codemirror/theme-one-dark --legacy-peer-deps
```

### Backend (Python)
Existing backend environment (`backend/venv`) requires:
- `fastapi`
- `uvicorn`
- `sqlalchemy`
- `psutil` (for process tree termination and memory monitoring)
- `pytest` & `httpx` (for test suite execution)

---

## 4. Host Compiler & Runtime Setup (Windows)

Students access the compiler through their browser over the LAN without installing any runtimes. The compilers/interpreters reside solely on the **host server PC**.

The system dynamically detects whether compilers are installed on system `PATH`. If missing, the UI displays actionable setup guides.

### 1. Python 3
- **Command:** `winget install Python.Python.3.13`
- **Important:** Ensure the "Add python.exe to PATH" option is checked.
- **Verification:** `python --version`

### 2. C (GCC) and C++ (G++)
- **Command:** `winget install MSYS2.MSYS2`
- In MSYS2 terminal: `pacman -S mingw-w64-ucrt-x86_64-gcc`
- Add `C:\msys64\ucrt64\bin` to Windows System `PATH`.
- **Verification:** `gcc --version` and `g++ --version`

### 3. Java (OpenJDK 17+)
- **Command:** `winget install EclipseAdoptium.Temurin.21.JDK`
- Ensure installer option "Set JAVA_HOME" and "Add to PATH" are enabled.
- **Verification:** `javac --version` and `java --version`

---

## 5. Backend Configuration & Environment Variables

The compiler feature uses the existing SATARK configuration. No new external cloud API keys or online compiler services are used.

| Environment Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Local SQLite database URL (defaults to `sqlite:///data/satark.db`) |
| `BACKEND_HOST` | Host binding IP (`0.0.0.0` for LAN access) |
| `BACKEND_PORT` | Port number (`8000`) |
| `JWT_SECRET` | Secret key for local JWT session verification |
| `API_V1_STR` | API prefix string (`/api/v1`) |
| `CORS_ORIGINS` | Permitted browser origins (supports LAN IP regex) |

*Note: The execution engine sanitizes environment variables before spawning code worker processes, preventing student code from accessing `DATABASE_URL` or `JWT_SECRET`.*

---

## 6. Database Migrations & Schema

### `practice_files` Table Definition
The `PracticeFile` model is registered in `backend/app/models/__init__.py`. When starting the backend with `init_db()`, SQLAlchemy automatically creates the table if it does not exist:

```sql
CREATE TABLE IF NOT EXISTS practice_files (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language VARCHAR(20) NOT NULL,
    filename VARCHAR(100) NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    stdin TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT uq_user_lang_filename UNIQUE (user_id, language, filename)
);
CREATE INDEX IF NOT EXISTS ix_practice_files_user_id ON practice_files(user_id);
CREATE INDEX IF NOT EXISTS ix_practice_files_language ON practice_files(language);
```

---

## 7. Run Commands

### 1. Launch All Services (Recommended)
Run the root launcher batch script:
```powershell
.\run.bat
```
This starts:
- FastAPI backend on `http://0.0.0.0:8000` with auto-reload.
- Teacher portal on `http://0.0.0.0:5174`.
- Student portal on `http://0.0.0.0:5173`.

### 2. Manual Commands
**Backend:**
```powershell
backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```
**Student Portal:**
```powershell
npm run dev:student
```
**Run Test Suite:**
```powershell
$env:PYTHONPATH="."; backend\venv\Scripts\pytest backend/tests/test_compiler.py
```

---

## 8. Integration Instructions for SATARK Repository

1. **Extract Files:** Copy the files from this archive into your SATARK repository root, preserving the directory structure.
2. **Install Dependencies:**
   ```powershell
   npm install -w @satark/student-portal @uiw/react-codemirror @codemirror/lang-python @codemirror/lang-cpp @codemirror/lang-java @codemirror/theme-one-dark --legacy-peer-deps
   ```
3. **Initialize Database Tables:**
   Starting FastAPI automatically executes `init_db()` in `lifespan`, creating the `practice_files` table in `satark.db`.
4. **Verify Tests:**
   ```powershell
   $env:PYTHONPATH="."; backend\venv\Scripts\pytest backend/tests
   ```
   All 34 tests should pass.
5. **Build Frontend:**
   ```powershell
   npm run build:student
   ```

---

## 9. Genuine Security Enforcement & Known Limitations

### Enforced Isolation
1. **Out-of-Process Execution:** Student code runs in dedicated subprocesses, never within the FastAPI web process.
2. **Resource Ceilings:**
   - 5.0-second CPU/wall timeout with recursive process tree termination (`psutil`).
   - 256 MB memory cap via Windows Job Objects (`JOBOBJECT_EXTENDED_LIMIT_INFORMATION`) and JVM heap parameters (`-Xmx256m`).
   - Active process ceiling preventing fork-bombs.
3. **Filesystem Isolation:** Dedicated ephemeral temp directories (`satark_exec_*`) deleted immediately upon process exit.
4. **Disabled Network Access:** Proxy variables stripped; network socket creation blocked in Python; JVM network routing redirected to dead loopback port.
5. **Output Cap:** Maximum 512 KB STDOUT buffer preventing memory exhaustion.

### Limitations
- **OS-Level Isolation (Bare Metal):** On native Windows, isolation is provided by OS process isolation, Job Objects, and process quotas. Containerized virtualization (e.g., Docker, Linux namespaces, cgroups, gVisor) is not present on bare-metal deployments.
- **Filesystem Permissions:** The ephemeral sandbox runs under the host user account executing the Python server.
