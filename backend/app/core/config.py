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

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            import json
            try:
                return json.loads(v)
            except Exception:
                return ["http://localhost:5173", "http://localhost:3000"]
        return v


settings = Settings()
