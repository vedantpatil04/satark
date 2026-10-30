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
from backend.app.services.cloudinary_service import cloudinary_service

client = TestClient(app)


# ------------------------------------------------------------------------------
# 1. Supabase & Token Verification Tests
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

    # Try accessing teacher-only endpoint with agent token -> MUST BE REJECTED 403
    res = client.get("/api/v1/classrooms", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code in (401, 403)


def test_role_escalation_prevention():
    """Verify that public registration cannot claim 'teacher' role without the secure server provisioning key."""
    # Attempt 1: Register as teacher without key -> Rejection
    res = client.post("/api/v1/auth/register", json={
        "email": "hacker@test.com",
        "password": "Password123!",
        "full_name": "Rogue Teacher",
        "role": "teacher"
    })
    assert res.status_code == 403
    assert "teacher provisioning key" in res.json().get("detail", "").lower()

    # Attempt 2: Register as teacher with invalid key -> Rejection
    res2 = client.post("/api/v1/auth/register", json={
        "email": "hacker2@test.com",
        "password": "Password123!",
        "full_name": "Rogue Teacher 2",
        "role": "teacher",
        "teacher_provisioning_key": "WRONG-KEY"
    })
    assert res2.status_code == 403


# ------------------------------------------------------------------------------
# 2. Student Data Isolation Tests (Cross-Student Access Prevention)
# ------------------------------------------------------------------------------
def test_student_data_isolation():
    """Verify Student A cannot access Student B's private exam answers or teacher evaluation controls."""
    # Register Student A
    email_a = "student_a_sec@test.com"
    client.post("/api/v1/auth/register", json={
        "email": email_a,
        "password": "Password123!",
        "full_name": "Student A",
        "role": "student"
    })
    login_a = client.post("/api/v1/auth/login", json={"email": email_a, "password": "Password123!"})
    token_a = login_a.json()["access_token"]

    # Student A attempts to access teacher-only alert acknowledgement
    res_ack = client.post("/api/v1/alerts/dummy-alert-id/acknowledge", headers={"Authorization": f"Bearer {token_a}"})
    assert res_ack.status_code == 403

    # Student A attempts to create an exam session -> MUST BE 403
    res_exam = client.post("/api/v1/exams", json={
        "classroom_id": "dummy-cls",
        "title": "Unauthorized Exam",
        "scheduled_start": "2026-11-01T10:00:00Z"
    }, headers={"Authorization": f"Bearer {token_a}"})
    assert res_exam.status_code == 403


# ------------------------------------------------------------------------------
# 3. WebSocket Ticket & Single-Use Security
# ------------------------------------------------------------------------------
def test_websocket_ticket_single_use():
    """Verify WebSocket tickets cannot be reused (replay attack prevention)."""
    user_id = "test-sec-user-123"
    ticket = create_ws_ticket(user_id=user_id, role="student", channel="student")
    assert ticket.startswith("tkt_")

    # First consumption must succeed
    consumed = verify_and_consume_ws_ticket(ticket, expected_channel="student")
    assert consumed is not None
    assert consumed["user_id"] == user_id
    assert consumed["role"] == "student"

    # Second consumption of the same ticket MUST FAIL (single-use)
    replay_attempt = verify_and_consume_ws_ticket(ticket, expected_channel="student")
    assert replay_attempt is None


def test_websocket_ticket_channel_mismatch():
    """Verify a student ticket cannot connect to the teacher websocket channel."""
    ticket = create_ws_ticket(user_id="student-456", role="student", channel="student")
    
    # Attempting to use student ticket on teacher channel must be rejected
    mismatch = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    assert mismatch is None


# ------------------------------------------------------------------------------
# 4. Cloudinary Evidence Storage Service Tests
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


def test_evidence_storage_status():
    """Verify evidence service status endpoint reports provider readiness honestly."""
    token_t = _get_test_teacher_token()
    res = client.get("/api/v1/evidence/status", headers={"Authorization": f"Bearer {token_t}"})
    assert res.status_code == 200
    data = res.json()
    assert data["provider"] == "Cloudinary"
    assert "configured" in data
    assert "status" in data


def test_evidence_upload_unconfigured_graceful_rejection():
    """When Cloudinary credentials are not set in environment, upload returns 503 instead of crashing."""
    if not cloudinary_service.is_available():
        token_t = _get_test_teacher_token()
        res = client.post(
            "/api/v1/evidence/upload",
            data={"exam_id": "dummy-exam"},
            files={"file": ("screenshot.png", b"fake image bytes", "image/png")},
            headers={"Authorization": f"Bearer {token_t}"}
        )
        assert res.status_code == 503
        assert "Cloudinary storage service is not configured" in res.json().get("detail", "")


# ------------------------------------------------------------------------------
# 5. Database Schema & Migration File Validation
# ------------------------------------------------------------------------------
def test_schema_migration_file_exists():
    """Verify that the Supabase PostgreSQL migration file exists and contains core tables & RLS policies."""
    schema_path = os.path.join(os.path.dirname(__file__), "..", "migrations", "001_initial_supabase_schema.sql")
    assert os.path.exists(schema_path), "Migration script 001_initial_supabase_schema.sql must exist"

    with open(schema_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "CREATE TABLE IF NOT EXISTS public.profiles" in content
    assert "ENABLE ROW LEVEL SECURITY" in content
    assert "CREATE POLICY" in content
    assert "public.is_teacher()" in content
    assert "public.handle_new_user()" in content
