import pytest
import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal
from backend.app.core.config import settings
from backend.app.models import User, Classroom, ClassroomEnrollment, ExamSession, Alert, AuditLog


@pytest.fixture
def test_setup():
    client = TestClient(app)
    db = SessionLocal()
    
    unique = uuid.uuid4().hex[:8]
    t_email = f"teacher_{unique}@test.com"
    s_email = f"student_{unique}@test.com"

    # Register teacher
    t_reg = client.post("/api/v1/auth/register", json={
        "email": t_email,
        "password": "Password123!",
        "full_name": "Teacher Tester",
        "role": "teacher",
        "teacher_provisioning_key": settings.TEACHER_PROVISIONING_KEY
    })
    assert t_reg.status_code == 201, t_reg.text
    t_login = client.post("/api/v1/auth/login", json={"email": t_email, "password": "Password123!"})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_user_id = t_login.json()["user"]["id"]

    # Register student
    s_reg = client.post("/api/v1/auth/register", json={
        "email": s_email,
        "password": "Password123!",
        "full_name": "Student Candidate",
        "role": "student"
    })
    assert s_reg.status_code == 201, s_reg.text
    s_login = client.post("/api/v1/auth/login", json={"email": s_email, "password": "Password123!"})
    assert s_login.status_code == 200
    s_token = s_login.json()["access_token"]
    s_user_id = s_login.json()["user"]["id"]

    # Teacher creates classroom
    c_res = client.post("/api/v1/classrooms", json={
        "title": f"Test Room {unique}",
        "subject_code": f"SUB_{unique}",
        "description": "Integrity Monitoring Test"
    }, headers={"Authorization": f"Bearer {t_token}"})
    assert c_res.status_code == 201
    class_id = c_res.json()["id"]
    join_code = c_res.json()["join_code"]

    # Student joins classroom
    enroll = client.post("/api/v1/classrooms/join", json={"join_code": join_code}, headers={"Authorization": f"Bearer {s_token}"})
    assert enroll.status_code == 200

    # Teacher creates exam
    now_iso = datetime.now(timezone.utc).isoformat()
    exam_res = client.post("/api/v1/exams", json={
        "classroom_id": class_id,
        "title": f"Midterm Exam {unique}",
        "duration_minutes": 60,
        "scheduled_start": now_iso
    }, headers={"Authorization": f"Bearer {t_token}"})
    assert exam_res.status_code == 201
    exam_id = exam_res.json()["id"]

    # Teacher starts exam
    act_res = client.post(f"/api/v1/exams/{exam_id}/start", headers={"Authorization": f"Bearer {t_token}"})
    assert act_res.status_code == 200

    yield {
        "client": client,
        "teacher_token": t_token,
        "student_token": s_token,
        "teacher_id": t_user_id,
        "student_id": s_user_id,
        "exam_id": exam_id,
        "db": db
    }

    db.close()


def test_tab_switch_enforcement_and_teacher_unlock(test_setup):
    client = test_setup["client"]
    t_headers = {"Authorization": f"Bearer {test_setup['teacher_token']}"}
    s_headers = {"Authorization": f"Bearer {test_setup['student_token']}"}
    exam_id = test_setup["exam_id"]
    student_id = test_setup["student_id"]

    # 1. First Tab Switch: Warning 1 (Not locked)
    res1 = client.post(f"/api/v1/exams/{exam_id}/tab-switch", json={
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "details": {
            "tab_switch_number": 1,
            "is_locked": False,
            "reason": "visibility_hidden"
        }
    }, headers=s_headers)
    assert res1.status_code == 200
    assert res1.json()["status"] == "recorded"
    assert res1.json()["is_locked"] is False
    assert res1.json()["tab_switch_number"] == 1

    # 2. Second Tab Switch: Warning 2 (Not locked)
    res2 = client.post(f"/api/v1/exams/{exam_id}/tab-switch", json={
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "details": {
            "tab_switch_number": 2,
            "is_locked": False,
            "reason": "visibility_hidden"
        }
    }, headers=s_headers)
    assert res2.status_code == 200
    assert res2.json()["is_locked"] is False
    assert res2.json()["tab_switch_number"] == 2

    # 3. Third Tab Switch: Exam Terminated & Locked (3/3 switches)
    res3 = client.post(f"/api/v1/exams/{exam_id}/tab-switch", json={
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "details": {
            "tab_switch_number": 3,
            "is_locked": True,
            "reason": "visibility_hidden"
        }
    }, headers=s_headers)
    assert res3.status_code == 200
    assert res3.json()["is_locked"] is True
    assert res3.json()["tab_switch_number"] == 3

    # Verify Teacher sees the alert in alerts list
    alerts_res = client.get(f"/api/v1/alerts?session_id={exam_id}", headers=t_headers)
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    tab_alerts = [a for a in alerts if a["alert_type"] == "tab_switch"]
    assert len(tab_alerts) >= 1

    # 4. Student requests unlock / re-admission
    req_unlock = client.post(f"/api/v1/exams/{exam_id}/request-unlock", json={
        "tab_switch_number": 3,
        "reason": "Student requested re-admission after 3 tab switches."
    }, headers=s_headers)
    assert req_unlock.status_code == 200
    assert req_unlock.json()["status"] == "requested"

    # 5. Teacher grants permission & unlocks student
    unlock_res = client.post(f"/api/v1/exams/{exam_id}/students/{student_id}/unlock", headers=t_headers)
    assert unlock_res.status_code == 200
    assert unlock_res.json()["status"] == "unlocked"
    assert unlock_res.json()["student_id"] == student_id

    # 6. Verify audit logs recorded both the request and teacher authorization
    db = test_setup["db"]
    audit_logs = db.query(AuditLog).filter(
        AuditLog.action.in_(["STUDENT_REQUESTED_EXAM_UNLOCK", "TEACHER_GRANTED_EXAM_UNLOCK"])
    ).all()
    actions = [l.action for l in audit_logs]
    assert "STUDENT_REQUESTED_EXAM_UNLOCK" in actions
    assert "TEACHER_GRANTED_EXAM_UNLOCK" in actions
