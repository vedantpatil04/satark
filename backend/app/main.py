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
from backend.app.api.routes.question_banks import router as question_banks_router
from backend.app.api.routes.media import router as media_router
from backend.app.api.routes.compiler import router as compiler_router
from backend.app.api.routes.notes import router as notes_router
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

# Development & LAN Origin Regex (supports satark.test, satark.local, mobile & workstation testing across private IP ranges)
LAN_ORIGIN_REGEX = r"^https?://(([a-zA-Z0-9-]+\.)*(satark\.test|satark\.local)|localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$"

# Standard CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=LAN_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ],
    expose_headers=["Content-Length", "Content-Range", "WWW-Authenticate"],
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
app.include_router(question_banks_router, prefix=api_v1_prefix)
app.include_router(media_router, prefix=api_v1_prefix)
app.include_router(compiler_router, prefix=api_v1_prefix)
app.include_router(notes_router, prefix=api_v1_prefix)

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
    ssl_key = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "certs", "key.pem"))
    ssl_cert = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "certs", "cert.pem"))
    ssl_kwargs = {}
    if os.path.exists(ssl_key) and os.path.exists(ssl_cert):
        ssl_kwargs["ssl_keyfile"] = ssl_key
        ssl_kwargs["ssl_certfile"] = ssl_cert
    uvicorn.run(
        "backend.app.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=True,
        **ssl_kwargs
    )

