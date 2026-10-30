# SATARK Codebase Cleanup & Architecture Audit Report

**Date**: 2026-10-30  
**Team**: WEBFARM (Vedant Patil, Amol Khumbar, Om Mohite, Maruti Shinde)  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  

---

## 1. Executive Summary

This report documents the repository cleanup, file classification, and architectural restructuring of SATARK. Following the migration to Supabase PostgreSQL and real-time WebRTC/WebSocket support, the frontend has been decoupled into two independent applications:
1. **Teacher Portal** (`apps/teacher-portal`)
2. **Student Portal** (`apps/student-portal`)

Both frontends utilize shared utility and component packages under `packages/` and connect to the authoritative FastAPI backend (`backend/`) and Supabase PostgreSQL persistence layer.

---

## 2. File & Directory Classification

All items in the codebase are classified into six categories:
- **A. REQUIRED**: Essential system files, source code, migrations, models, or configurations.
- **B. USED**: Active runtime assets, native builds, and auxiliary prototype modules.
- **C. REUSABLE**: Shared logic, types, API clients, and UI primitives.
- **D. OBSOLETE**: Unused, abandoned, or superceded legacy files.
- **E. GENERATED**: Build artifacts, caches, and reproducible temporary files.
- **F. UNKNOWN / MANUAL REVIEW**: Files flagged for team confirmation before any modification.

### Detailed Inventory

| Path | Category | Classification Reason & Status |
| :--- | :---: | :--- |
| `backend/` | **A** | Primary FastAPI backend service (auth, WebSocket, WebRTC, exams, focus, audit). |
| `backend/migrations/` | **A** | SQL schemas and SQLite-to-Supabase migration scripts (`001_initial_supabase_schema.sql`, etc.). |
| `android/` | **A** | Capacitor native Android project for mobile student deployment. |
| `desktop-agent/` | **A** | Cross-platform Python desktop proctoring agent. |
| `browser-extension/` | **A** | Chrome/Edge extension for tab integrity and visibility detection. |
| `public/models/` | **A** | Computer Vision weights (TensorFlow/TeachableMachine) for Focus Mode and eye-tracking. |
| `public/app-debug.apk` | **B** | Compiled Android APK for student testing and demonstration. |
| `Python_Eye_Detector/` | **B** | Experimental standalone OpenCV eye-tracker prototype. Retained intact. |
| `smart_classroom.db` | **A** | Local SQLite baseline database. Retained intact. |
| `smart_classroom_backup_phase2.db` | **A** | Full pre-migration SQLite backup. Retained intact. |
| `test_smart_classroom.db` | **E** | Auto-generated pytest database artifact. Safely cleaned up by pytest. |
| `dist/` | **E** | Vite build directory. Reproducible via `npm run build`. |
| `.pytest_cache/` | **E** | Pytest execution cache. Reproducible. |
| `bun.lockb` | **D** | Unused Bun lockfile. Repository is standardized on `npm` and `package-lock.json`. Safely removed. |
| `screen.ipynb` | **F** | Scratch exploratory Jupyter notebook for screen-capture experiments. Retained in archive. |
| `packages/shared-types/` | **C** | Authoritative TypeScript interfaces shared across portals. |
| `packages/shared-api/` | **C** | Shared Axios/Fetch client and REST API endpoint definitions. |
| `packages/shared-auth/` | **C** | Shared Supabase client, AuthContext, ProtectedRoute, and token handlers. |
| `packages/shared-ui/` | **C** | Reusable Radix UI primitives, design tokens, and styling utilities. |
| `packages/shared-config/` | **C** | Common TypeScript and Tailwind configuration bases. |
| `apps/teacher-portal/` | **A** | Dedicated frontend for teachers (proctoring, exams, classrooms, alerts). |
| `apps/student-portal/` | **A** | Dedicated frontend for students (exam taking, focus mode, history, notifications). |

---

## 3. Preservation Commitments

1. **Focus Mode & CV Assets**: All TensorFlow models (`public/models/`) and MediaPipe face-detection libraries remain intact.
2. **Database Integrity**: The live Supabase PostgreSQL connection string and migration scripts are preserved. No database drops or resets were executed.
3. **Android & Mobile**: `android/`, `mobile/`, and `capacitor.config.ts` remain intact for mobile synchronization (`npx cap sync android`).
4. **Desktop Agent & Extension**: `desktop-agent/` and `browser-extension/` continue to connect seamlessly to the shared backend WebSocket endpoint.
5. **Security Credentials**: No passwords, Supabase secret keys, or JWT private keys are placed in frontend directories or version control.

