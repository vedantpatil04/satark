from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import text
from backend.app.core.config import settings
from backend.app.core.database import engine, init_db
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.classrooms import router as classrooms_router
from backend.app.api.routes.devices import router as devices_router
from backend.app.api.routes.exams import router as exams_router
from backend.app.api.routes.focus import router as focus_router
from backend.app.api.routes.alerts import router as alerts_router
from backend.app.api.routes.notifications import router as notifications_router
from backend.app.api.routes.audit import router as audit_router
from backend.app.api.routes.reports import router as reports_router
from backend.app.api.routes.evidence import router as evidence_router
from backend.app.websocket.routes import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    init_db()
    yield
    # Cleanup if needed on shutdown


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API and WebSocket real-time engine for Smart Classroom exam integrity and focus management.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root Health Endpoints
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "Smart Classroom Backend",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0"
    }


@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
def api_v1_health_check():
    db_status = "connected"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "api_version": "v1",
        "roles_supported": settings.VALID_ROLES
    }


# Mount REST API Routers
api_v1_prefix = settings.API_V1_STR
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(classrooms_router, prefix=api_v1_prefix)
app.include_router(devices_router, prefix=api_v1_prefix)
app.include_router(exams_router, prefix=api_v1_prefix)
app.include_router(focus_router, prefix=api_v1_prefix)
app.include_router(alerts_router, prefix=api_v1_prefix)
app.include_router(notifications_router, prefix=api_v1_prefix)
app.include_router(audit_router, prefix=api_v1_prefix)
app.include_router(reports_router, prefix=api_v1_prefix)
app.include_router(evidence_router, prefix=api_v1_prefix)

# Mount Real-Time WebSocket Routes
app.include_router(ws_router)


# Mobile APK Download Route
@app.get("/download-apk", tags=["Mobile App"])
@app.get(f"{settings.API_V1_STR}/download-apk", tags=["Mobile App"])
def download_apk():
    apk_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    )
    if not os.path.exists(apk_path):
        raise HTTPException(status_code=404, detail="APK build not found on server")
    return FileResponse(
        path=apk_path,
        filename="smart-classroom-app-debug.apk",
        media_type="application/vnd.android.package-archive"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.app.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=True
    )

