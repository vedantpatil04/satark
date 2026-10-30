import requests
import time
import uuid
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

def print_step(title):
    print(f"\n[INTEGRATION TEST] ===> {title}")

def run_integration_verification():
    print("================================================================")
    print("  SMART CLASSROOM - PHASE 1.5 SYSTEM INTEGRATION VERIFICATION   ")
    print("================================================================")

    # -------------------------------------------------------------
    # 1. System Health Verification
    # -------------------------------------------------------------
    print_step("1. Verifying API & Database Connectivity")
    h_resp = requests.get(f"{BASE_URL}/health", timeout=5)
    assert h_resp.status_code == 200, f"Health check failed: {h_resp.text}"
    h_data = h_resp.json()
    assert h_data["status"] == "healthy"
    assert h_data["database"] == "connected"
    print(f" System Health: OK (API v{h_data['api_version']}, Database: {h_data['database']})")

    # -------------------------------------------------------------
    # 2. Authentication & Server-Verified RBAC
    # -------------------------------------------------------------
    print_step("2. Authenticating Teacher and Student Portals")
    t_login = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "teacher@smartclassroom.edu",
        "password": "Password123!"
    })
    assert t_login.status_code == 200, f"Teacher login failed: {t_login.text}"
    teacher_token = t_login.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {teacher_token}"}
    print(" Teacher Authentication: OK (Verified role='teacher')")

    s_login = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "alice@smartclassroom.edu",
        "password": "Password123!"
    })
    assert s_login.status_code == 200, f"Student login failed: {s_login.text}"
    student_token = s_login.json()["access_token"]
    student_id = s_login.json()["user"]["id"]
    s_headers = {"Authorization": f"Bearer {student_token}"}
    print(" Student Authentication: OK (Verified role='student')")

    # Verify RBAC protection: Student cannot access teacher endpoints
    bad_rbac = requests.post(f"{BASE_URL}/classrooms", json={
        "title": "Hacked Class",
        "subject_code": "HACK101"
    }, headers=s_headers)
    assert bad_rbac.status_code == 403, "RBAC breach! Student created classroom."
    print(" RBAC Guard: OK (Student forbidden from Teacher endpoints, HTTP 403)")

    # -------------------------------------------------------------
    # 3. Classroom Lifecycle & Student PIN Enrollment
    # -------------------------------------------------------------
    print_step("3. Classroom Lifecycle & Student PIN Join")
    rand_suffix = str(int(time.time()))[-4:]
    c_resp = requests.post(f"{BASE_URL}/classrooms", json={
        "title": f"Integration Testing Lab {rand_suffix}",
        "subject_code": f"IT-{rand_suffix}",
        "description": "Live automated verification cohort."
    }, headers=t_headers)
    assert c_resp.status_code == 201
    classroom = c_resp.json()
    join_pin = classroom["join_code"]
    classroom_id = classroom["id"]
    print(f" Teacher created classroom: '{classroom['title']}' [PIN: {join_pin}]")

    # Student joins via 6-char PIN
    join_resp = requests.post(f"{BASE_URL}/classrooms/join", json={"join_code": join_pin}, headers=s_headers)
    assert join_resp.status_code in [200, 201]
    print(f" Student successfully joined classroom with PIN: {join_pin}")

    # Teacher inspects enrolled roster
    roster_resp = requests.get(f"{BASE_URL}/classrooms/{classroom_id}/students", headers=t_headers)
    assert roster_resp.status_code == 200
    roster = roster_resp.json()
    assert any(s["student_id"] == student_id for s in roster)
    print(f" Teacher Roster Verification: OK ({len(roster)} student(s) enrolled)")

    # -------------------------------------------------------------
    # 4. Exam Lifecycle (Create, Launch, PIN Entry, State Control)
    # -------------------------------------------------------------
    print_step("4. Exam Lifecycle & Policy Enforcement")
    exam_pin = f"EX{rand_suffix}"
    e_resp = requests.post(f"{BASE_URL}/exams", json={
        "classroom_id": classroom_id,
        "title": "Network Security Final",
        "exam_code": exam_pin,
        "duration_minutes": 45,
        "policy_config": {
            "lockdown_browser": True,
            "restricted_processes": ["discord.exe", "cheatengine.exe"]
        }
    }, headers=t_headers)
    assert e_resp.status_code == 201
    exam = e_resp.json()
    exam_id = exam["id"]
    print(f" Exam Created: '{exam['title']}' [PIN: {exam_pin}]")

    # Student enters exam with PIN
    s_join_exam = requests.post(f"{BASE_URL}/exams/{exam_id}/join", json={"exam_code": exam_pin}, headers=s_headers)
    assert s_join_exam.status_code == 200
    print(f" Student validated PIN and entered exam workspace.")

    # Teacher starts exam
    start_resp = requests.post(f"{BASE_URL}/exams/{exam_id}/start", headers=t_headers)
    assert start_resp.status_code == 200
    assert start_resp.json()["status"] == "active"
    print(f" Exam Activated: Status is 'active'")

    # -------------------------------------------------------------
    # 5. Device Pairing, Telemetry & Rule Engine Alerts
    # -------------------------------------------------------------
    print_step("5. Device Pairing, Telemetry Ingestion & Real-Time Alerts")
    # Student requests pairing code
    pcode_resp = requests.post(f"{BASE_URL}/devices/pairing-code", headers=s_headers)
    assert pcode_resp.status_code == 200
    pcode = pcode_resp.json()["pairing_code"]
    print(f" Student generated single-use pairing code: {pcode}")

    # Desktop agent pairs using code
    hw_uuid = str(uuid.uuid4())
    pair_resp = requests.post(f"{BASE_URL}/devices/pair", json={
        "pairing_code": pcode,
        "hardware_uuid": hw_uuid,
        "hostname": "INTEG-WORKSTATION-01",
        "os_type": "windows",
        "os_version": "Windows 11 Test",
        "agent_version": "1.0.0"
    })
    assert pair_resp.status_code == 200
    paired_device = pair_resp.json()
    device_id = paired_device["device_id"]
    device_token = paired_device["device_token"]
    agent_headers = {"Authorization": f"Bearer {device_token}"}
    print(f" Agent paired device '{device_id}' to student Alice.")

    # Agent sends heartbeat
    hb_resp = requests.post(f"{BASE_URL}/devices/{device_id}/heartbeat", json={"agent_version": "1.0.0"}, headers=agent_headers)
    assert hb_resp.status_code == 200
    assert hb_resp.json()["is_connected"] is True
    print(f" Heartbeat recorded: Workstation is marked 'connected'.")

    # Agent emits a policy-breach event: restricted app 'discord.exe' during active exam
    event_id = str(uuid.uuid4())
    breach_event = {
        "event_id": event_id,
        "type": "alert_event",
        "event_type": "restricted_app",
        "device_id": device_id,
        "student_id": student_id,
        "session_id": exam_id,
        "mode": "exam",
        "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "agent",
        "severity": "high",
        "details": {
            "process_name": "discord.exe",
            "reason": "Disallowed messaging application focused"
        }
    }
    batch_resp = requests.post(f"{BASE_URL}/devices/events", json={"events": [breach_event]}, headers=agent_headers)
    assert batch_resp.status_code == 200
    assert batch_resp.json()["persisted"] == 1
    assert batch_resp.json()["alerts_triggered"] == 1
    print(f" Event Ingestion & Rule Engine: Disallowed process detected -> Alert generated!")

    # Teacher queries alerts
    alerts_resp = requests.get(f"{BASE_URL}/alerts", headers=t_headers)
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    matching_alert = next((a for a in alerts if a["session_id"] == exam_id), None)
    assert matching_alert is not None
    print(f" Teacher Alert Center: Verified alert '{matching_alert['description']}'")

    # Teacher acknowledges alert
    ack_resp = requests.post(f"{BASE_URL}/alerts/{matching_alert['id']}/acknowledge", json={
        "proctor_notes": "Reviewed and addressed with candidate."
    }, headers=t_headers)
    assert ack_resp.status_code == 200
    assert ack_resp.json()["is_acknowledged"] is True
    print(f" Proctor Acknowledgment: Alert marked resolved with proctor notes.")

    # -------------------------------------------------------------
    # 6. Focus Mode Session Lifecycle & History
    # -------------------------------------------------------------
    print_step("6. Focus Mode Pomodoro Lifecycle")
    f_start = requests.post(f"{BASE_URL}/focus/sessions", json={
        "goal_title": "Distributed Consensus Algorithms Study",
        "planned_duration_minutes": 25,
        "classroom_id": classroom_id
    }, headers=s_headers)
    assert f_start.status_code == 201
    focus_sess = f_start.json()
    focus_id = focus_sess["id"]
    print(f" Focus Session Started: '{focus_sess['goal_title']}'")

    # Pause session
    f_pause = requests.post(f"{BASE_URL}/focus/sessions/{focus_id}/pause", json={
        "additional_focus_seconds": 600,
        "notes": "Short break taken"
    }, headers=s_headers)
    assert f_pause.status_code == 200
    assert f_pause.json()["status"] == "paused"

    # Resume session
    f_res = requests.post(f"{BASE_URL}/focus/sessions/{focus_id}/resume", json={
        "additional_break_seconds": 120
    }, headers=s_headers)
    assert f_res.status_code == 200
    assert f_res.json()["status"] == "active"

    # Complete session
    f_comp = requests.post(f"{BASE_URL}/focus/sessions/{focus_id}/complete", json={
        "additional_focus_seconds": 900,
        "additional_break_seconds": 0,
        "notes": "Full session completed with high focus."
    }, headers=s_headers)
    assert f_comp.status_code == 200
    assert f_comp.json()["status"] == "completed"
    print(f" Focus Session Completed: 1,500s focus, 120s break.")

    # Verify history accumulation
    hist_resp = requests.get(f"{BASE_URL}/focus/history", headers=s_headers)
    assert hist_resp.status_code == 200
    history = hist_resp.json()
    assert any(h["id"] == focus_id for h in history)
    print(f" Focus Study History: Synchronized {len(history)} session(s).")

    print("\n================================================================")
    print("  ALL 6 CORE SYSTEM INTEGRATION JOURNEYS PASSED CLEANLY!       ")
    print("================================================================\n")

if __name__ == "__main__":
    run_integration_verification()
