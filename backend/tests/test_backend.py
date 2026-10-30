import os
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.core.database import Base, get_db
from backend.app.core.config import settings
from backend.app.main import app
from backend.app.core.security import verify_and_consume_ws_ticket

# Setup separate test database
TEST_DB_URL = "sqlite:///./test_smart_classroom.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Initialize test schema
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    # Teardown
    Base.metadata.drop_all(bind=test_engine)
    if os.path.exists("./test_smart_classroom.db"):
        try:
            os.remove("./test_smart_classroom.db")
        except Exception:
            pass


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# Global fixtures to hold test tokens across steps
@pytest.fixture(scope="session")
def state():
    return {}


def test_1_and_2_health_endpoints(client):
    """Test 1: App starts, Test 2: Health endpoints work, Test 3: DB initializes"""
    res1 = client.get("/health")
    assert res1.status_code == 200
    assert res1.json()["status"] == "healthy"

    res2 = client.get("/api/v1/health")
    assert res2.status_code == 200
    data = res2.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "teacher" in data["roles_supported"]
    assert "student" in data["roles_supported"]


def test_4_teacher_registration_and_login(client, state):
    """Test 4: Teacher registration with server-verified key and login"""
    # Reject invalid teacher key
    bad_res = client.post("/api/v1/auth/register", json={
        "email": "bad_teacher@school.edu",
        "password": "Password123!",
        "full_name": "Fake Teacher",
        "role": "teacher",
        "teacher_provisioning_key": "WRONG_KEY"
    })
    assert bad_res.status_code == 403

    # Valid teacher registration
    res = client.post("/api/v1/auth/register", json={
        "email": "prof.turing@school.edu",
        "password": "SecurePassword123!",
        "full_name": "Prof. Alan Turing",
        "role": "teacher",
        "teacher_provisioning_key": settings.TEACHER_PROVISIONING_KEY
    })
    assert res.status_code == 201
    teacher_data = res.json()
    assert teacher_data["role"] == "teacher"
    state["teacher_id"] = teacher_data["id"]

    # Teacher Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": "prof.turing@school.edu",
        "password": "SecurePassword123!"
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    state["teacher_token"] = token_data["access_token"]


def test_5_student_registration_and_login(client, state):
    """Test 5: Student registration defaults to student, and login works"""
    res = client.post("/api/v1/auth/register", json={
        "email": "student.alice@school.edu",
        "password": "StudentPassword123!",
        "full_name": "Alice Smith"
    })
    assert res.status_code == 201
    student_data = res.json()
    assert student_data["role"] == "student"
    state["student_id"] = student_data["id"]

    # Student Login
    login_res = client.post("/api/v1/auth/login", json={
        "email": "student.alice@school.edu",
        "password": "StudentPassword123!"
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    state["student_token"] = token_data["access_token"]


def test_6_role_permissions(client, state):
    """Test 6: Students cannot invoke teacher-only administrative endpoints"""
    headers = {"Authorization": f"Bearer {state['student_token']}"}
    res = client.post("/api/v1/classrooms", json={"title": "Unauthorized Class"}, headers=headers)
    assert res.status_code == 403
    assert "forbidden" in res.json()["detail"].lower()


def test_7_and_8_classroom_creation_and_join(client, state):
    """Test 7: Teacher creates classroom, Test 8: Student joins with join_code"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    create_res = client.post("/api/v1/classrooms", json={
        "title": "Algorithms 101",
        "subject_code": "CS-301",
        "description": "Foundations of Computer Science"
    }, headers=teacher_headers)
    assert create_res.status_code == 201
    classroom = create_res.json()
    state["classroom_id"] = classroom["id"]
    state["join_code"] = classroom["join_code"]

    # Student joins
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    join_res = client.post("/api/v1/classrooms/join", json={
        "join_code": state["join_code"]
    }, headers=student_headers)
    assert join_res.status_code == 200

    # Duplicate join rejected
    dup_res = client.post("/api/v1/classrooms/join", json={
        "join_code": state["join_code"]
    }, headers=student_headers)
    assert dup_res.status_code == 400

    # Teacher retrieves enrolled students
    students_res = client.get(f"/api/v1/classrooms/{state['classroom_id']}/students", headers=teacher_headers)
    assert students_res.status_code == 200
    assert len(students_res.json()) == 1
    assert students_res.json()[0]["student_id"] == state["student_id"]


def test_9_and_10_device_registration_and_heartbeat(client, state):
    """Test 9: Device registration works, Test 10: Heartbeat updates device status"""
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    reg_res = client.post("/api/v1/devices/register", json={
        "hardware_uuid": "HW-UUID-TEST-999888",
        "hostname": "STUDENT-LAPTOP",
        "os_type": "windows",
        "os_version": "Windows 11 Pro",
        "agent_version": "1.0.0"
    }, headers=student_headers)
    assert reg_res.status_code == 200
    dev_data = reg_res.json()
    assert dev_data["status"] == "connected"
    state["device_id"] = dev_data["id"]

    # Heartbeat
    hb_res = client.post(f"/api/v1/devices/{state['device_id']}/heartbeat", json={
        "agent_version": "1.0.0",
        "cpu_usage_percent": 15.2
    }, headers=student_headers)
    assert hb_res.status_code == 200
    assert hb_res.json()["is_connected"] is True


def test_11_exam_session_lifecycle(client, state):
    """Test 11: Exam state transitions (draft -> active -> paused -> active -> ended)"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    create_res = client.post("/api/v1/exams", json={
        "classroom_id": state["classroom_id"],
        "title": "Midterm Algorithms Examination",
        "duration_minutes": 60,
        "policy_config": {"allow_window_blur": False}
    }, headers=teacher_headers)
    assert create_res.status_code == 201
    exam = create_res.json()
    state["exam_id"] = exam["id"]
    state["exam_code"] = exam["exam_code"]

    # Student joins exam
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    join_res = client.post(f"/api/v1/exams/{exam['id']}/join", json={
        "exam_code": state["exam_code"],
        "device_id": state["device_id"]
    }, headers=student_headers)
    assert join_res.status_code == 200

    # Start exam
    start_res = client.post(f"/api/v1/exams/{exam['id']}/start", headers=teacher_headers)
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "active"

    # Pause exam
    pause_res = client.post(f"/api/v1/exams/{exam['id']}/pause", headers=teacher_headers)
    assert pause_res.status_code == 200
    assert pause_res.json()["status"] == "paused"

    # Resume exam
    resume_res = client.post(f"/api/v1/exams/{exam['id']}/resume", headers=teacher_headers)
    assert resume_res.status_code == 200
    assert resume_res.json()["status"] == "active"

    # End exam
    end_res = client.post(f"/api/v1/exams/{exam['id']}/end", headers=teacher_headers)
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ended"

    # Invalid transition: cannot start an ended exam
    invalid_res = client.post(f"/api/v1/exams/{exam['id']}/start", headers=teacher_headers)
    assert invalid_res.status_code == 400


def test_12_focus_session_lifecycle(client, state):
    """Test 12: Focus session state transitions and separate history"""
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    create_res = client.post("/api/v1/focus/sessions", json={
        "goal_title": "Chapter 4 Dynamic Programming Study",
        "planned_duration_minutes": 25,
        "classroom_id": state["classroom_id"]
    }, headers=student_headers)
    assert create_res.status_code == 201
    f_sess = create_res.json()
    assert f_sess["status"] == "active"
    f_id = f_sess["id"]

    # Pause
    p_res = client.post(f"/api/v1/focus/sessions/{f_id}/pause", json={"additional_focus_seconds": 600}, headers=student_headers)
    assert p_res.status_code == 200
    assert p_res.json()["status"] == "paused"
    assert p_res.json()["actual_focus_seconds"] == 600

    # Resume
    r_res = client.post(f"/api/v1/focus/sessions/{f_id}/resume", json={"additional_break_seconds": 120}, headers=student_headers)
    assert r_res.status_code == 200
    assert r_res.json()["status"] == "active"
    assert r_res.json()["actual_break_seconds"] == 120

    # Complete
    c_res = client.post(f"/api/v1/focus/sessions/{f_id}/complete", json={"additional_focus_seconds": 900}, headers=student_headers)
    assert c_res.status_code == 200
    assert c_res.json()["status"] == "completed"
    assert c_res.json()["actual_focus_seconds"] == 1500

    # Retrieve Focus History
    h_res = client.get("/api/v1/focus/history", headers=student_headers)
    assert h_res.status_code == 200
    assert len(h_res.json()) >= 1
    assert h_res.json()[0]["id"] == f_id


def test_13_and_14_event_ingestion_and_deduplication(client, state):
    """Test 13: Duplicate events rejected, Test 14: Events persisted and trigger alerts"""
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    event_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    envelope = {
        "event_id": event_id,
        "type": "activity_event",
        "event_type": "restricted_website",
        "device_id": state["device_id"],
        "student_id": state["student_id"],
        "classroom_id": state["classroom_id"],
        "session_id": state["exam_id"],
        "mode": "exam",
        "occurred_at": now_iso,
        "source": "agent",
        "severity": "high",
        "details": {"url_or_domain": "chegg.com"}
    }

    # First ingestion
    ingest_res = client.post("/api/v1/devices/events", json={"events": [envelope]}, headers=student_headers)
    assert ingest_res.status_code == 200
    assert ingest_res.json()["persisted"] == 1
    assert ingest_res.json()["duplicates_skipped"] == 0
    assert ingest_res.json()["alerts_triggered"] == 1

    # Second ingestion with SAME event_id (Deduplication)
    dup_res = client.post("/api/v1/devices/events", json={"events": [envelope]}, headers=student_headers)
    assert dup_res.status_code == 200
    assert dup_res.json()["persisted"] == 0
    assert dup_res.json()["duplicates_skipped"] == 1

    # Check alert was created and teacher can retrieve/acknowledge it
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    alerts_res = client.get(f"/api/v1/alerts?session_id={state['exam_id']}", headers=teacher_headers)
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert len(alerts) >= 1
    alert_id = alerts[0]["id"]

    # Acknowledge alert
    ack_res = client.post(f"/api/v1/alerts/{alert_id}/acknowledge", json={
        "proctor_notes": "Reviewed tab switch with candidate"
    }, headers=teacher_headers)
    assert ack_res.status_code == 200
    assert ack_res.json()["is_acknowledged"] is True


def test_15_and_16_ws_ticket_and_invalid_auth(client, state):
    """Test 15: WebSocket ticket authentication works, Test 16: Invalid authentication is rejected"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    ticket_res = client.post("/api/v1/auth/ws-ticket", json={"channel": "teacher"}, headers=teacher_headers)
    assert ticket_res.status_code == 200
    ticket = ticket_res.json()["ticket"]
    assert ticket.startswith("tkt_")

    # Verify and consume ticket (single-use)
    ticket_data = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    assert ticket_data is not None
    assert ticket_data["user_id"] == state["teacher_id"]
    assert ticket_data["role"] == "teacher"

    # Second consumption must fail (single-use proof)
    second_data = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    assert second_data is None

    # Test 16: Invalid authentication is rejected
    unauth_res = client.get("/api/v1/auth/me")
    assert unauth_res.status_code == 401

    fake_res = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer fake.jwt.token"})
    assert fake_res.status_code == 401


def test_17_exam_questions_crud(client, state):
    """Test 17: Teacher creates/updates/deletes MCQ questions; student cannot see correct answers"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}

    # 1. Create a draft exam for question testing
    exam_res = client.post("/api/v1/exams", json={
        "classroom_id": state["classroom_id"],
        "title": "Algorithms & Data Structures Quiz",
        "duration_minutes": 45,
        "policy_config": {"disallow_window_blur": True}
    }, headers=teacher_headers)
    assert exam_res.status_code == 201
    quiz_id = exam_res.json()["id"]
    state["quiz_id"] = quiz_id

    # 2. Teacher adds Question 1
    q1_res = client.post(f"/api/v1/exams/{quiz_id}/questions", json={
        "question_text": "What is the average time complexity of QuickSort?",
        "options": ["O(n)", "O(n log n)", "O(n^2)", "O(1)"],
        "correct_option_index": 1,
        "marks": 2,
        "order_num": 1
    }, headers=teacher_headers)
    assert q1_res.status_code == 201
    q1 = q1_res.json()
    assert q1["correct_option_index"] == 1
    state["q1_id"] = q1["id"]

    # 3. Teacher adds Question 2
    q2_res = client.post(f"/api/v1/exams/{quiz_id}/questions", json={
        "question_text": "Which data structure uses LIFO ordering?",
        "options": ["Queue", "Stack", "Array", "Linked List"],
        "correct_option_index": 1,
        "marks": 1,
        "order_num": 2
    }, headers=teacher_headers)
    assert q2_res.status_code == 201
    state["q2_id"] = q2_res.json()["id"]

    # 4. Teacher retrieves questions: correct_option_index MUST be visible
    t_get = client.get(f"/api/v1/exams/{quiz_id}/questions", headers=teacher_headers)
    assert t_get.status_code == 200
    t_questions = t_get.json()
    assert len(t_questions) == 2
    assert t_questions[0]["correct_option_index"] == 1

    # 5. Student retrieves questions: correct_option_index MUST BE WITHHELD (None)
    s_get = client.get(f"/api/v1/exams/{quiz_id}/questions", headers=student_headers)
    assert s_get.status_code == 200
    s_questions = s_get.json()
    assert len(s_questions) == 2
    assert s_questions[0]["correct_option_index"] is None
    assert s_questions[1]["correct_option_index"] is None

    # 6. Teacher updates Question 1
    up_res = client.put(f"/api/v1/exams/{quiz_id}/questions/{q1['id']}", json={
        "marks": 3
    }, headers=teacher_headers)
    assert up_res.status_code == 200
    assert up_res.json()["marks"] == 3


def test_18_student_answer_submission_and_auto_grading(client, state):
    """Test 18: Student saves answers, submits exam, auto-grades MCQs, prevents duplicate submission"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    quiz_id = state["quiz_id"]

    # Start quiz
    start_res = client.post(f"/api/v1/exams/{quiz_id}/start", headers=teacher_headers)
    assert start_res.status_code == 200

    # Student saves answer for Question 1 (Correct: option 1)
    ans1_res = client.post(f"/api/v1/exams/{quiz_id}/answers", json={
        "question_id": state["q1_id"],
        "selected_option_index": 1
    }, headers=student_headers)
    assert ans1_res.status_code == 200

    # Student saves answer for Question 2 (Incorrect: option 0 instead of 1)
    ans2_res = client.post(f"/api/v1/exams/{quiz_id}/answers", json={
        "question_id": state["q2_id"],
        "selected_option_index": 0
    }, headers=student_headers)
    assert ans2_res.status_code == 200

    # Retrieve student draft answers
    get_ans = client.get(f"/api/v1/exams/{quiz_id}/answers", headers=student_headers)
    assert get_ans.status_code == 200
    assert len(get_ans.json()) == 2

    # Student submits examination
    sub_res = client.post(f"/api/v1/exams/{quiz_id}/submit", json={"answers": []}, headers=student_headers)
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["status"] == "submitted"
    # Q1 was 3 marks (correct), Q2 was 1 mark (incorrect) -> Total: 3 / 4 marks = 75%
    assert sub_data["score"] is None or sub_data["score"] == 3  # Score masked if active

    # Verify duplicate submission is rejected (HTTP 400)
    dup_sub = client.post(f"/api/v1/exams/{quiz_id}/submit", json={"answers": []}, headers=student_headers)
    assert dup_sub.status_code == 400
    assert "already submitted" in dup_sub.json()["detail"].lower()

    # Teacher reviews submissions
    teacher_subs = client.get(f"/api/v1/exams/{quiz_id}/submissions", headers=teacher_headers)
    assert teacher_subs.status_code == 200
    subs_list = teacher_subs.json()
    assert len(subs_list) == 1
    assert subs_list[0]["score"] == 3
    assert subs_list[0]["total_marks"] == 4
    assert subs_list[0]["percentage"] == 75.0


def test_19_browser_tab_switch_alert(client, state):
    """Test 19: Student web client sends tab_switch event, triggers teacher alert"""
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    quiz_id = state["quiz_id"]
    event_id = str(uuid.uuid4())

    # Send tab switch event
    tab_res = client.post(f"/api/v1/exams/{quiz_id}/tab-switch", json={
        "event_id": event_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "details": {"reason": "visibility_hidden", "client": "Chrome Web"}
    }, headers=student_headers)
    assert tab_res.status_code == 200
    assert tab_res.json()["status"] == "recorded"
    assert tab_res.json()["alert_triggered"] is True

    # Teacher verifies the alert was created with incident details
    alerts_res = client.get(f"/api/v1/alerts?session_id={quiz_id}", headers=teacher_headers)
    assert alerts_res.status_code == 200
    tab_alerts = [a for a in alerts_res.json() if a["alert_type"] == "tab_switch"]
    assert len(tab_alerts) >= 1
    assert "Tab-Switch Detected" in tab_alerts[0]["description"]


def test_20_advanced_classroom_controls_and_announcements(client, state):
    """Test 20: Grant exam time, send classroom announcement, verify notification receipt and leave classroom"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    classroom_id = state["classroom_id"]
    quiz_id = state["quiz_id"]

    # 1. Grant exam additional time
    grant_res = client.post(f"/api/v1/exams/{quiz_id}/grant-time", json={"additional_minutes": 15}, headers=teacher_headers)
    assert grant_res.status_code == 200
    assert grant_res.json()["additional_minutes"] == 15

    # 2. Teacher broadcasts classroom announcement
    ann_res = client.post(f"/api/v1/classrooms/{classroom_id}/announcements", json={
        "title": "Exam Extension Notice",
        "message": "All students have been granted 15 additional minutes for technical review."
    }, headers=teacher_headers)
    assert ann_res.status_code == 201
    assert ann_res.json()["recipients_count"] >= 1

    # 3. Student checks notifications
    notif_res = client.get("/api/v1/notifications", headers=student_headers)
    assert notif_res.status_code == 200
    notifs = notif_res.json()
    assert any("Exam Extension Notice" in n["message"] for n in notifs)

    # 4. Student leaves classroom
    leave_res = client.delete(f"/api/v1/classrooms/{classroom_id}/leave", headers=student_headers)
    assert leave_res.status_code == 200
    assert leave_res.json()["classroom_id"] == classroom_id


def test_21_focus_analytics(client, state):
    """Test 21: Verify persisted Focus Mode analytics and trends calculation"""
    student_headers = {"Authorization": f"Bearer {state['student_token']}"}
    res = client.get("/api/v1/focus/analytics", headers=student_headers)
    assert res.status_code == 200
    data = res.json()
    assert "daily_focus_seconds" in data
    assert "weekly_focus_seconds" in data
    assert "total_completed_sessions" in data
    assert "completion_rate_percentage" in data
    assert "daily_trends" in data
    assert len(data["daily_trends"]) == 7


def test_22_exam_report_summary_and_csv_export(client, state):
    """Test 22: Verify institutional examination summary report and CSV export"""
    teacher_headers = {"Authorization": f"Bearer {state['teacher_token']}"}
    quiz_id = state["quiz_id"]

    # 1. Summary JSON report
    sum_res = client.get(f"/api/v1/reports/exams/{quiz_id}/summary", headers=teacher_headers)
    assert sum_res.status_code == 200
    sum_data = sum_res.json()
    assert sum_data["exam_id"] == quiz_id
    assert "total_submissions" in sum_data
    assert "candidates" in sum_data
    assert len(sum_data["candidates"]) >= 1

    # 2. CSV Export
    csv_res = client.get(f"/api/v1/reports/exams/{quiz_id}/export-csv", headers=teacher_headers)
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers.get("content-type", "")
    assert "Student Name" in csv_res.text
    assert "Tab Switches" in csv_res.text





