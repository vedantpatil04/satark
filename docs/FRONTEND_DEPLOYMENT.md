# SATARK Frontend Deployment Guide (Vercel & Monorepo)

**Team**: WEBFARM  
**Platform**: SATARK — Smart Classroom Integrity & Focus Management Platform  

---

## 1. Architecture Overview

SATARK uses two independent Vercel project deployments for the frontend, both connecting to a single Render-hosted FastAPI backend and a central Supabase project.

```
                              ┌────────────────────────────────────────┐
                              │  Render: SATARK FastAPI Backend        │
                              │  https://satark-backend.onrender.com   │
                              └───────────────────▲────────────────────┘
                                                  │
                 ┌────────────────────────────────┴───────────────────────────────┐
                 │                                                                │
┌────────────────┴──────────────────┐                          ┌──────────────────┴──────────────────┐
│  Vercel Project 1:                │                          │  Vercel Project 2:                  │
│  SATARK Teacher Portal            │                          │  SATARK Student Portal              │
│  Root: apps/teacher-portal        │                          │  Root: apps/student-portal          │
│  Domains: https://teacher.satark  │                          │  Domains: https://student.satark    │
└───────────────────────────────────┘                          └─────────────────────────────────────┘
                 │                                                                │
                 └────────────────────────────────┬───────────────────────────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │  Supabase Cloud     │
                                       │  Auth + PostgreSQL  │
                                       └─────────────────────┘
```

---

## 2. Vercel Project 1: Teacher Portal

### Project Configuration
- **Framework Preset**: Vite
- **Root Directory**: `apps/teacher-portal`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install` (executed from repo root or workspace)

### Environment Variables
| Variable Name | Production Value | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `https://ugsizlimcnxtbzkwficf.supabase.co` | Supabase root endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `[YOUR_SUPABASE_PUBLISHABLE_KEY]` | Supabase client anon/publishable key |
| `VITE_API_BASE_URL` | `https://satark-backend.onrender.com/api/v1` | Production backend API |

### Routing & Rewrites
Configured in `apps/teacher-portal/vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 3. Vercel Project 2: Student Portal

### Project Configuration
- **Framework Preset**: Vite
- **Root Directory**: `apps/student-portal`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables
| Variable Name | Production Value | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `https://ugsizlimcnxtbzkwficf.supabase.co` | Supabase root endpoint |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `[YOUR_SUPABASE_PUBLISHABLE_KEY]` | Supabase client anon/publishable key |
| `VITE_API_BASE_URL` | `https://satark-backend.onrender.com/api/v1` | Production backend API |

### Routing & Rewrites
Configured in `apps/student-portal/vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 4. Verification Checklist Before Going Live

1. [x] **No Secrets in Frontend Bundles**: Checked production JavaScript output; neither the Supabase secret key nor database credentials appear in client bundles.
2. [x] **Independent Builds**: Both portals compile successfully via `npm run build` in their respective folders.
3. [x] **SPA Refresh**: `vercel.json` rewrites redirect all sub-routes (`/dashboard`, `/classrooms/:id`, `/exams/:id`) to `index.html`.
4. [x] **WSS Protocol**: WebSockets in production automatically map `https://` to `wss://` for secure live notifications.
5. [x] **CORS Configuration**: Render backend environment has `CORS_ORIGINS=["https://*.vercel.app"]` enabled.

