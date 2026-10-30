import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PROJECT_NAME: str = "Smart Classroom – Exam Integrity & Focus Management System"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    
    # Host & Port
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000

    # Database
    DATABASE_URL: str = "sqlite:///./smart_classroom.db"

    # JWT & Security
    SECRET_KEY: str = "dev-secret-key-change-in-production-smart-classroom-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours for testing
    WS_TICKET_EXPIRE_SECONDS: int = 60      # Short-lived ticket for WebSockets

    # Controlled Teacher Account Provisioning Key
    # Public registration defaults to 'student'; teacher role requires this key.
    TEACHER_PROVISIONING_KEY: str = "TEACHER-SECURE-KEY-2026"

    # Supported Roles: strictly 'teacher' and 'student'
    VALID_ROLES: List[str] = ["teacher", "student"]

    # Supabase Cloud Configuration
    SUPABASE_URL: str = "https://ugsizlimcnxtbzkwficf.supabase.co"
    SUPABASE_SECRET_KEY: Union[str, None] = None
    SUPABASE_JWKS_URL: str = "https://ugsizlimcnxtbzkwficf.supabase.co/auth/v1/.well-known/jwks.json"

    # Cloudinary Evidence Storage Configuration
    CLOUDINARY_CLOUD_NAME: Union[str, None] = None
    CLOUDINARY_API_KEY: Union[str, None] = None
    CLOUDINARY_API_SECRET: Union[str, None] = None

    # WebRTC STUN/TURN Configuration
    WEBRTC_STUN_URLS: List[str] = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    WEBRTC_TURN_URL: Union[str, None] = None
    WEBRTC_TURN_USERNAME: Union[str, None] = None
    WEBRTC_TURN_CREDENTIAL: Union[str, None] = None

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        raw_list = []
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("["):
                import json
                try:
                    raw_list = json.loads(v_str)
                except Exception:
                    raw_list = [i.strip() for i in v_str.strip("[]").split(",") if i.strip()]
            else:
                raw_list = [i.strip() for i in v_str.split(",") if i.strip()]
        elif isinstance(v, list):
            raw_list = v

        clean_origins = set()
        for item in raw_list:
            if isinstance(item, str):
                cleaned = item.strip().strip("'\"").rstrip("/")
                if cleaned and not cleaned.startswith("*"):
                    clean_origins.add(cleaned)

        default_dev_origins = {
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        }
        clean_origins.update(default_dev_origins)
        return sorted(list(clean_origins))


settings = Settings()
