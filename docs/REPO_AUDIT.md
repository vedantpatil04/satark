# Repository Audit & Baseline Findings

**Project**: Smart Classroom – Exam Integrity & Focus Management System  
**Stage**: Phase 1.1 Foundation Audit  
**Date**: October 2026  
**Auditor**: Lead Software Architect & Senior Full-Stack Engineer  

---

## 1. Executive Summary

This repository audit evaluated the workspace state, dependencies, configuration, and structural requirements for unifying our Smart Classroom platform. The project unites two operational modes:
1. **Exam Mode**: Proctored exam management, student device verification, tamper-resistant desktop agent telemetry, explainable integrity alerts, and timeline auditing.
2. **Focus Mode**: Structured study sessions, goal-oriented Pomodoro timer, gentle distraction notifications, local attention tracking, and focus analytics.

### Key Finding on Existing Repositories
- **Current Workspace**: Located at `study-zen-vision-main-main`, containing the frontend implementation for **Focus Mode** (`src/pages/FocusMode.tsx`, `src/pages/TimeSelection.tsx`, `src/components/FocusMode/*`, camera feed, AI assistant, and Haar Cascade eye detection scripts).
- **Remote Repository (`teacher-page.git`)**: Located at `https://github.com/prajwal07-pro/teacher-page.git`. This contains the **Teacher Portal** (Teacher Dashboard, Attendance, Classes, Timetable, Assignments, Gate Pass, Career Hub, Complaints, and FaceScanner).
- **Evaluation**: The current workspace is an unzipped project that preserved Focus Mode work. Both repositories share an identical frontend design system (Vite + React 18 + Tailwind CSS + shadcn/ui + Radix UI primitives). Rather than destructively wiping either codebase or creating nested repositories, our architecture unites both interfaces under a single role-based React application.

---

## 2. Workspace File & Directory Inventory

```
study-zen-vision-main-main/
├── .gitignore                      # Configured for Node, Vite, Python, and SQLite
├── .npmrc                          # Engine & package management settings
├── .env.example                    # Clean environment template (created in 1.1)
├── bun.lockb                       # Bun lockfile (legacy Lovable artifact)
├── package-lock.json               # Primary npm lockfile (9,328 lines)
├── package.json                    # Frontend project manifest
├── package.json.backup             # Backup preserving original dependency manifest
├── eslint.config.js                # ESLint flat config with TypeScript rules
├── index.html                      # Single page application HTML entry point
├── postcss.config.js               # PostCSS with Tailwind & Autoprefixer
├── tailwind.config.ts              # Tailwind CSS configuration with design system tokens
├── tsconfig.json                   # Root TypeScript project references
├── tsconfig.app.json               # Application-level TypeScript configuration
├── tsconfig.node.json              # Vite/Node tooling TypeScript configuration
├── vercel.json                     # SPA rewrite configuration
├── vite.config.ts                  # Vite build configuration with React SWC & path alias (@)
├── public/                         # Static assets (favicons, icons, model weights)
├── Python_Eye_Detector/            # Prototype Python OpenCV scripts (eye_detector.py, server.py)
├── screen.ipynb                    # Prototype screen activity exploration notebook
├── src/
│   ├── App.tsx                     # Main application routing and provider setup
│   ├── App.css                     # Global utility styles
│   ├── index.css                   # Tailwind base layer and CSS variables
│   ├── main.tsx                    # React DOM root render
│   ├── firebaseConfig.ts           # Firebase SDK initialization
│   ├── vite-env.d.ts               # Vite client type definitions
│   ├── components/
│   │   ├── AIFocusAssistant.tsx    # Focus conversational widget
│   │   ├── FocusDetection.tsx      # OpenCV.js face & eye detector component
│   │   ├── FocusMode.css           # Styling for focus overlays
│   │   ├── QuizGenerator.tsx       # AI question generator using Gemini API
│   │   ├── ScreenActivityDetector.tsx # Web-based screen OCR activity detector
│   │   ├── ScreenMonitor.tsx       # Screen monitoring wrapper
│   │   ├── TestTextClassifier.tsx  # Distraction classification test utility
│   │   ├── FocusMode/              # Focus sub-components (CameraFeed, Chatbot, FocusSetup, FocusTimer, FocusStatus)
│   │   └── ui/                     # 40+ shadcn/ui reusable components
│   ├── hooks/
│   │   ├── use-mobile.tsx          # Responsive mobile breakpoint detection
│   │   ├── use-toast.ts            # Toast notification management hook
│   │   ├── useFocusDetection.ts    # Attention detection hook
│   │   └── useWebcam.ts            # Video stream acquisition hook
│   ├── lib/
│   │   ├── textClassifier.ts       # Text keyword & heuristic distraction classifier
│   │   ├── types.ts                # TypeScript shared interfaces
│   │   └── utils.ts                # Tailwind clsx/twMerge utility
│   ├── pages/
│   │   ├── FocusMode.tsx           # Active focus session dashboard
│   │   ├── NotFound.tsx            # 404 fallback page
│   │   └── TimeSelection.tsx       # Focus goal and duration selector
│   └── utils/
│       └── beep.ts                 # Web Audio API alert sound generator
├── backend/                        # (Created in 1.1) FastAPI Python backend foundation
├── desktop-agent/                  # (Created in 1.1) Windows & Linux monitoring agent foundation
├── mobile/                         # (Created in 1.1) Capacitor Android mobile foundation
├── docs/                           # (Created in 1.1) Architecture, API, Schema & Phase docs
└── scripts/                        # (Created in 1.1) Automation & verification scripts
```

---

## 3. Dependency & Toolchain Analysis

### 3.1 Host Environment
- **Operating System**: Windows (Win32 x64)
- **Node.js**: `v22.22.3` (Modern LTS)
- **npm**: `10.9.8`
- **Python**: `3.13.3` (Compatible with FastAPI, SQLAlchemy, and desktop agent libraries)
- **Git**: `2.50.1.windows.1`

### 3.2 Frontend Package Manifest (`package.json`)
- **Core Framework**: `react` 18.3.1, `react-dom` 18.3.1, `react-router-dom` 6.28.0
- **Build Tooling**: `vite` 5.4.10 / 5.4.20, `@vitejs/plugin-react-swc` 3.7.1, `typescript` 5.6.2
- **UI Components & Styling**:
  - `@radix-ui/react-*` (Complete suite: dialog, dropdown, tabs, popover, tooltip, slider, select, etc.)
  - `tailwindcss` 3.4.14 with `tailwindcss-animate`
  - `class-variance-authority` 0.7.0, `clsx` 2.1.1, `tailwind-merge` 2.5.4
  - `lucide-react` 0.468.0 (standard icon set)
  - `recharts` 2.14.1 (charts and telemetry visualizers)
  - `sonner` 1.7.1 & Radix Toaster (notifications)
- **Client Machine Learning & Vision Libraries**:
  - `@tensorflow/tfjs` 4.22.0
  - `@tensorflow-models/face-detection` 1.0.3
  - `@mediapipe/face_detection` 0.4.1646425229
  - `tesseract.js` 5.1.1 (Client-side OCR for study window text)
  - `@google/generative-ai` 0.21.0 (Gemini client SDK)
- **Cloud & Backend Integrations**:
  - `firebase` 12.4.0 (legacy firestore integration in prototypes)
  - `@tanstack/react-query` 5.59.16 (Data fetching & cache)

---

## 4. Reusable Components & Design System Catalog

The existing codebase contains a mature set of reusable UI components:

| Category | Component Name | Path | Reuse Strategy |
| :--- | :--- | :--- | :--- |
| **Foundation UI** | `Button`, `Card`, `Badge`, `Input`, `Dialog`, `Sheet`, `Select`, `Table`, `Tabs`, `Slider`, `Switch` | `src/components/ui/*` | Retain as shared UI library for both Teacher and Student modes. |
| **Data Viz** | `Chart`, `recharts` wrappers | `src/components/ui/chart.tsx` | Reuse for Exam integrity timelines and Focus session analytics. |
| **Notifications** | `sonner`, `toast`, `use-toast` | `src/components/ui/sonner.tsx`, `use-toast.ts` | Reuse for non-intrusive focus nudges and teacher alert toasts. |
| **Focus Mode** | `FocusTimer`, `FocusStatus`, `CameraFeed`, `FocusSetup` | `src/components/FocusMode/*` | Direct reuse for Student Focus Mode. |
| **Audio Alert** | `beep.ts` | `src/utils/beep.ts` | Reusable for gentle focus reminders and exam countdown signals. |
| **Teacher Layout** | `Sidebar`, `MetricCard`, `NextClassCard` | In `teacher-page` remote | Migrate cleanly into unified role-based navigation. |
| **Class Management** | `Classes.tsx`, `Attendance.tsx` | In `teacher-page` remote | Adapt from Firebase to FastAPI REST/WebSocket endpoints. |

---

## 5. Verification: Build, Typecheck, and Lint Diagnostics

The following diagnostic checks were executed directly in the workspace:

### 5.1 Production Build (`npm run build`)
- **Status**: **PASSED (Exit Code 0)**
- **Duration**: 11.56s
- **Output Artifacts**:
  - `dist/index.html`: 1.36 kB
  - `dist/assets/index-DycBTybo.css`: 76.77 kB (gzip: 13.03 kB)
  - `dist/assets/index-Qnx8o4gA.js`: 2,676.26 kB (gzip: 528.39 kB)
- **Build Note**: Large bundle size warning triggered by bundled TensorFlow / Tesseract dependencies. Code-splitting via dynamic imports will be applied in Phase 1.3.

### 5.2 TypeScript Type Checking (`npx tsc --noEmit`)
- **Status**: **PASSED (Exit Code 0)**
- **Output**: 0 type errors across all application source files.

### 5.3 ESLint Analysis (`npm run lint`)
- **Status**: **FAILED (Exit Code 1)**
- **Summary**: 39 problems total (26 errors, 13 warnings).
- **Categorization of Lint Issues**:
  1. `@typescript-eslint/no-explicit-any` (12 occurrences): Found in `AIFocusAssistant.tsx`, `FocusDetection.tsx`, `QuizGenerator.tsx`, `ScreenActivityDetector.tsx`, `TimeSelection.tsx`, `beep.ts`.
  2. `no-empty` block statements (3 occurrences): Found in `AIFocusAssistant.tsx` exception handlers.
  3. `prefer-const` (6 occurrences): Found in `FocusDetection.tsx` variable declarations.
  4. `react-hooks/exhaustive-deps` (6 warnings): Found in effect hooks in `FocusMode/CameraFeed.tsx`, `FocusDetection.tsx`, `ScreenActivityDetector.tsx`, `ScreenMonitor.tsx`, `FocusMode.tsx`.
  5. `@typescript-eslint/no-empty-object-type` (2 occurrences): In shadcn `command.tsx` and `textarea.tsx`.
  6. `@typescript-eslint/no-require-imports` (1 occurrence): `require("tailwindcss-animate")` in `tailwind.config.ts`.
- **Resolution Plan**: These are code style/lint warnings that do not block Vite bundling. They will be resolved cleanly during Phase 1.3 refactoring without altering component behavior.

---

## 6. Identified Risks, Technical Limitations & Mitigation Plan

| Risk / Limitation | Severity | Impact | Mitigation Plan |
| :--- | :--- | :--- | :--- |
| **Hardcoded Firebase Keys** | High | `src/firebaseConfig.ts` contains hardcoded public project keys. | Move all configuration to `.env` variables; shift state management to FastAPI + SQLite backend. |
| **Heavy Client-Side ML Libraries** | Medium | TensorFlow.js and Tesseract.js bloat bundle size to ~2.6 MB and cause high client CPU/GPU usage. | Keep client-side vision lightweight; use Python desktop agent and server-side analysis for authoritative events. |
| **Disjoint Teacher & Student Codebases** | High | Teacher views and Student views lived in separate git origins. | Unify both portals inside this single repository with role-based routing (`/teacher/*` vs `/student/*`). |
| **Missing Native Realtime Pipeline** | High | Current client relies on polling or direct Firestore hooks. | Establish FastAPI native WebSocket channels (`/ws/teacher`, `/ws/student`, `/ws/agent`). |
| **Privacy Compliance in Monitoring** | Critical | Proctoring tools risk breaching student privacy if surveillance is hidden or intrusive. | Strictly implement visible, policy-driven monitoring with clear student consent banners and zero hidden keyloggers. |

