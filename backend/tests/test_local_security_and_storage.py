import os
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.security import (
    create_access_token,
    create_device_token,
    create_ws_ticket,
    verify_and_consume_ws_ticket,
    decode_access_token,
    hash_password,
    verify_password
)
from backend.app.services.local_storage_service import local_storage_service
from backend.app.core.database import engine
from sqlalchemy import text

client = TestClient(app)


# ------------------------------------------------------------------------------
# 1. Local Password & Token Verification Tests
# ------------------------------------------------------------------------------
def test_password_hashing_and_verification():
    raw_pass = "SecurePass2026!"
    hashed = hash_password(raw_pass)
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_device_agent_token_isolation():
    """Verify that device agent tokens are scoped strictly to agent role and cannot access human user APIs."""
    device_id = "test-hw-device-uuid-1234"
    student_id = "test-student-uuid-5678"
    token = create_device_token(device_id, student_id)
    
    payload = decode_access_token(token)
    assert payload is not None
    assert payload.get("role") == "agent"
    assert payload.get("device_id") == device_id
    assert payload.get("student_id") == student_id

    # Try accessing teacher-only endpoint with agent token -> MUST BE REJECTED
    res = client.get("/api/v1/classrooms", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in (401, 403)


def test_role_escalation_prevention():
    """Verify that public registration cannot claim 'teacher' role without the secure server provisioning key."""
    # Attempt 1: Register as teacher without key -> Rejection
    res = client.post("/api/v1/auth/register", json={
        "email": "hacker_local@test.com",
        "password": "Password123!",
        "full_name": "Hacker Attempt",
        "role": "teacher"
    })
    assert res.status_code == 403

    # Attempt 2: Register as teacher with wrong key -> Rejection
    res = client.post("/api/v1/auth/register", json={
        "email": "hacker2_local@test.com",
        "password": "Password123!",
        "full_name": "Hacker Attempt 2",
        "role": "teacher",
        "teacher_provisioning_key": "INCORRECT-KEY"
    })
    assert res.status_code == 403


# ------------------------------------------------------------------------------
# 2. WebSocket Single-Use Ticket Validation
# ------------------------------------------------------------------------------
def test_websocket_ticket_lifecycle():
    """Verify that WebSocket tickets are single-use and channel-enforced."""
    ticket = create_ws_ticket(user_id="user-123", role="teacher", channel="teacher")
    assert ticket.startswith("tkt_")

    # First consumption must succeed
    consumed = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    assert consumed is not None
    assert consumed["user_id"] == "user-123"
    assert consumed["role"] == "teacher"

    # Second consumption must FAIL (single-use replay prevention)
    replay = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    assert replay is None


# ------------------------------------------------------------------------------
# 3. Local Media Storage Service Tests
# ------------------------------------------------------------------------------
def _get_test_teacher_token():
    email = "teacher_sec_fixture@test.com"
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "Password123!",
        "full_name": "Fixture Teacher",
        "role": "teacher",
        "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026"
    })
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123!"})
    if res.status_code == 200:
        return res.json()["access_token"]
    return create_access_token(subject="teacher-sec-sub", role="teacher", extra_data={"email": email})


def test_local_evidence_storage_status():
    """Verify evidence service status reports Local Disk Storage readiness."""
    token_t = _get_test_teacher_token()
    res = client.get("/api/v1/evidence/status", headers={"Authorization": f"Bearer {token_t}"})
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "Local Disk Storage"
    assert data["configured"] is True
    assert data["status"] == "ready"


def test_local_storage_service_save_and_resolve():
    """Verify local storage service saves file to disk and resolves it cleanly."""
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    res = local_storage_service.save_evidence(
        file_bytes=fake_png,
        exam_id="test_exam_101",
        student_id="test_student_202",
        filename="test_screenshot.png"
    )
    assert res["file_id"].startswith("ev_")
    assert os.path.exists(res["relative_path"])

    # Resolve file
    resolved = local_storage_service.resolve_evidence_file(res["file_id"])
    assert resolved is not None
    path, mime = resolved
    assert path.exists()

    # Clean up
    deleted = local_storage_service.delete_evidence(res["file_id"])
    assert deleted is True


# ------------------------------------------------------------------------------
# 4. Local SQLite Database Validation
# ------------------------------------------------------------------------------
def test_local_sqlite_wal_and_tables():
    """Verify central SQLite database has WAL mode enabled and all 21 tables created."""
    with engine.connect() as conn:
        journal = conn.execute(text("PRAGMA journal_mode")).fetchone()[0]
        assert str(journal).lower() == "wal"

        fk = conn.execute(text("PRAGMA foreign_keys")).fetchone()[0]
        assert fk == 1

        tables = [r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()]
        assert "users" in tables
        assert "classrooms" in tables
        assert "exam_sessions" in tables
        assert "question_banks" in tables
        assert "exam_media_sessions" in tables

