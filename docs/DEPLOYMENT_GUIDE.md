# SATARK — Production Cloud Deployment Guide

**Project**: SATARK — Smart Classroom Integrity & Focus Management Platform  
**Team**: WEBFARM (Vedant Patil, Amol Khumbar, Om Mohite, Maruti Shinde)  
**Target Platforms**: Supabase (Database & Identity), Render (FastAPI Backend), Vercel (React Frontend)  

---

## 1. Supabase Setup (Database & Authentication)

### 1.1 Project Reference
* **Supabase Project URL**: `https://ugsizlimcnxtbzkwficf.supabase.co`
* **JWKS Endpoint**: `https://ugsizlimcnxtbzkwficf.supabase.co/auth/v1/.well-known/jwks.json`

### 1.2 Database Schema & Row Level Security (RLS)
1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/ugsizlimcnxtbzkwficf).
2. Navigate to **SQL Editor** → **New Query**.
3. Copy the entire contents of [`backend/migrations/001_initial_supabase_schema.sql`](file:///c:/Users/Vedant%20%20Patil/Downloads/study-zen-vision-main-main%20(1)/study-zen-vision-main-main/backend/migrations/001_initial_supabase_schema.sql).
4. Run the query. This will:
   * Create `public.profiles` synchronized with `auth.users` via trigger.
   * Create all core tables (`classrooms`, `enrollments`, `devices`, `exam_sessions`, `questions`, `submissions`, `student_answers`, `focus_sessions`, `alerts`, `audit_logs`).
   * Enable Row Level Security (RLS) across all tables with role-gated policies.

### 1.3 PostgreSQL Connection String (Transaction Pooler)
1. In the Supabase Dashboard, navigate to **Project Settings** → **Database** → **Connection String**.
2. Select **Connection Pooling** → **Transaction mode** (Port `6543`).
3. Copy the URI. It follows the structure:
   ```text
   postgresql://postgres.ugsizlimcnxtbzkwficf:[YOUR-DB-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
   ```
4. Configure this URI as `DATABASE_URL` in your Render backend environment variables.

---

## 2. Render Deployment (FastAPI Backend)

### 2.1 Web Service Configuration
1. Log in to [Render](https://dashboard.render.com/) and click **New +** → **Web Service**.
2. Connect your GitHub repository: `https://github.com/vedantpatil04/satark.git`.
3. Configure the service settings:
   * **Name**: `satark-backend`
   * **Region**: Choose closest to database (e.g. `Oregon` or `Singapore`)
   * **Branch**: `main`
   * **Root Directory**: Leave blank (repository root)
   * **Runtime**: `Python 3`
   * **Build Command**: `pip install -r backend/requirements.txt`
   * **Start Command**: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`

### 2.2 Render Environment Variables
Add the following in Render **Environment** tab:

| Variable | Value / Description | Sensitive |
| :--- | :--- | :---: |
| `PYTHON_VERSION` | `3.11.9` | No |
| `ENVIRONMENT` | `production` | No |
| `DATABASE_URL` | Supabase Transaction Pooler URI (Port `6543`) | **Yes** |
| `SUPABASE_URL` | `https://ugsizlimcnxtbzkwficf.supabase.co` | No |
| `SUPABASE_JWKS_URL` | `https://ugsizlimcnxtbzkwficf.supabase.co/auth/v1/.well-known/jwks.json` | No |
| `SUPABASE_SECRET_KEY` | Supabase Secret Key (from API settings) | **Yes** |
| `SECRET_KEY` | High-entropy random 64-character secret | **Yes** |
| `AGENT_TOKEN_SECRET` | High-entropy random 64-character secret | **Yes** |
| `TEACHER_PROVISIONING_KEY`| High-entropy passkey for teacher provisioning | **Yes** |
| `FRONTEND_URL` | `https://satark.vercel.app` (or your Vercel domain) | No |
| `CORS_ORIGINS` | `["https://*.vercel.app","http://localhost:5173"]` | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account name (for evidence media) | No |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | **Yes** |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | **Yes** |
| `WEBRTC_STUN_URLS` | `["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]` | No |

---

## 3. Vercel Deployment (React + Vite Frontend)

### 3.1 Project Import & Build
1. Log in to [Vercel](https://vercel.com/) and click **Add New...** → **Project**.
2. Select your repository: `https://github.com/vedantpatil04/satark.git`.
3. Vercel automatically detects Vite framework preset:
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
   * **SPA Routing**: Handled automatically by [`vercel.json`](file:///c:/Users/Vedant%20%20Patil/Downloads/study-zen-vision-main-main%20(1)/study-zen-vision-main-main/vercel.json) rewrites.

### 3.2 Vercel Environment Variables
Add the following in Vercel **Environment Variables** tab:

| Variable | Value | Notes |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://satark-backend.onrender.com/api/v1` | Replace with your live Render URL |
| `VITE_WS_BASE_URL` | `wss://satark-backend.onrender.com/ws` | Secure WebSocket protocol (`wss://`) |
| `VITE_SUPABASE_URL` | `https://ugsizlimcnxtbzkwficf.supabase.co` | Supabase Root URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key | Found in Supabase API settings |
| `VITE_APP_MODE` | `production` | Production mode flag |

---

## 4. WebRTC 1-to-1 Live Screen Sharing Verification

1. **Teacher Action**: Open active exam at `/teacher/exams/:id` → Under candidates or alerts, click **"Request Screen"**.
2. **Signaling**: Request routes via Render WebSocket (`/ws/teacher` → `/ws/student`).
3. **Student Action**: Prompt opens with security details. Student clicks **"Accept & Select Screen"**.
4. **Browser Prompt**: Student selects entire screen or window via `navigator.mediaDevices.getDisplayMedia()`.
5. **P2P Negotiation**: WebRTC SDP Offer / Answer and ICE Candidates exchanged over WebSocket.
6. **Live Viewing**: Teacher stream opens in high-definition video modal. Persistent banner reminds student that proctor is viewing. Either participant can end the stream anytime.
