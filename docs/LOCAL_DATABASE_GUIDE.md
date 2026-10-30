# SATARK — Local SQLite Database Guide

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Engine**: SQLite 3 (via SQLAlchemy 2.0 ORM)  
**Location**: `data/satark.db`  

---

## 1. Database Specifications & Configuration

The local SATARK deployment uses SQLite as its single, central, authoritative database. It replaces former cloud PostgreSQL instances with an offline, high-performance, embedded database engine managed exclusively by the FastAPI backend server.

### Core PRAGMA Optimizations:
Configured at connection time in `backend/app/core/database.py`:
```python
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON;")      # Enforces referential integrity
    cursor.execute("PRAGMA journal_mode=WAL;")     # Write-Ahead Logging for high concurrent read throughput
    cursor.execute("PRAGMA busy_timeout=5000;")    # 5-second lock timeout for short-lived transactions
    cursor.close()
```

### Critical Concurrency & Safety Rules:
1. **Single Access Point**: Only the local FastAPI backend interacts with `data/satark.db`. Client laptops, teacher tablets, and Android apps NEVER connect directly to the SQLite file. All data operations flow through authenticated REST endpoints and WebSockets.
2. **Local Disk Storage**: The database file resides on the host computer's local solid-state drive. It is **never** hosted on a shared network drive (SMB/NFS) to avoid SQLite file-locking corruptions.
3. **Short Transactions**: SQLAlchemy sessions are scoped per request (`get_db` dependency) and commit or roll back immediately.

---

## 2. Schema Architecture & Compatibility View

The SATARK database comprises **21 tables** covering all aspects of classroom integrity, exams, focus sessions, and audit logging:
- `users`: Core credentials, roles (`teacher`, `student`), full names, and account timestamps.
- `classrooms`: Course codes, names, semester terms, and enrollment join PINs.
- `enrollments`: Association table between students and classrooms with active flags.
- `exams`: Exam metadata, scheduled start/end times, PINs, and security policies.
- `questions` & `question_options`: Question banks, MCQ choices, point values, and correct answers.
- `exam_submissions` & `student_answers`: Candidate responses, auto-evaluated scores, and submission states.
- `devices`: Workstation attestation records, paired device hashes, and online statuses.
- `pairing_codes`: Single-use 6-character agent pairing codes with 10-minute expiry.
- `device_events` & `agent_heartbeats`: Desktop telemetry, active foreground window titles, and multi-monitor status.
- `tab_switch_events`: Browser focus and blur integrity timestamps.
- `integrity_alerts`: Policy-triggered violations with human adjudication workflows.
- `focus_sessions` & `focus_nudges`: Focus Mode study blocks, Pomodoro cycles, and attention lapse records.
- `audit_logs`: Immutable, append-only security timeline for administrative actions.

### Schema Compatibility View:
To maintain backward compatibility with legacy routes while normalizing user schemas:
```sql
CREATE VIEW IF NOT EXISTS profiles AS SELECT * FROM users;
```

---

## 3. Local Administration CLI (`backend.app.cli`)

SATARK provides an administrative command-line interface for offline database initialization, account provisioning, password recovery, and backups:

```powershell
# 1. Initialize Schema & Tables
python -m backend.app.cli init-db

# 2. Provision Teacher Administrator Account
python -m backend.app.cli create-teacher --email "prof.satark@local.lan" --name "Prof. Robert Langdon" --password "SecureTeacher123!"

# 3. Securely Reset an Existing User Password
python -m backend.app.cli reset-password --email "student@smartclassroom.edu" --password "NewPassword123!"

# 4. Generate Timestamped Database Backup
python -m backend.app.cli backup-db

# 5. Check Database Journal Mode & Table Count
python -m backend.app.cli db-status
```

---

## 4. Backup & Disaster Recovery Procedures

### Automated Backup Location:
All database backups are written to:
```
data/backups/satark_YYYYMMDD_HHMMSS.db
```

### Manual Backup (Safe with WAL mode):
Because SQLite is running in WAL mode, backups can be taken while the server is running using the Python CLI or SQLite `.backup` command:
```powershell
# Create an on-demand backup
python -m backend.app.cli backup-db
```

### Restoring from Backup:
1. Stop SATARK services:
   ```powershell
   .\scripts\stop-satark.ps1
   ```
2. Copy the desired backup file over `data/satark.db`:
   ```powershell
   Copy-Item "data\backups\satark_20261031_010203.db" "data\satark.db" -Force
   Remove-Item "data\satark.db-wal", "data\satark.db-shm" -Force -ErrorAction SilentlyContinue
   ```
3. Restart SATARK:
   ```powershell
   .\scripts\start-satark.ps1
   ```

