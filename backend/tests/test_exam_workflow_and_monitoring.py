import os
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_complete_exam_workflow_and_multi_student_monitoring():
    unique = os.getpid()
    teacher_email = f"exam_prof_{unique}@satark.lan"
    password = "SecurePassword123!"

    # 1. Register Teacher
    t_reg = client.post("/api/v1/auth/register", json={
        "email": teacher_email,
        "password": password,
        "full_name": "Prof. Alan Turing",
        "role": "teacher",
        "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026"
    })
    assert t_reg.status_code == 201

    t_login = client.post("/api/v1/auth/login", json={"email": teacher_email, "password": password})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {t_token}"}

    # 2. Verify Canonical Question Template (All 4 types)
    template_resp = client.get("/api/v1/exams/questions/template", headers=t_headers)
    assert template_resp.status_code == 200
    template_data = template_resp.json()
    assert template_data["schemaVersion"] == "1.0"
    types_in_template = {q["question_type"] for q in template_data["questions"]}
    assert {"mcq", "multiple_select", "true_false", "short_answer"}.issubset(types_in_template)

    # 3. Create Classroom & Exam
    c_resp = client.post("/api/v1/classrooms", json={
        "title": f"Computer Science {unique}",
        "subject_code": "CS-401",
        "description": "Network Systems & Protocols"
    }, headers=t_headers)
    assert c_resp.status_code == 201
    classroom_id = c_resp.json()["id"]
    join_code = c_resp.json()["join_code"]

    e_resp = client.post("/api/v1/exams", json={
        "classroom_id": classroom_id,
        "title": "Final Examination: Distributed Systems",
        "duration_minutes": 60,
        "scheduled_start": "2026-11-01T10:00:00Z",
        "policy_config": {
            "require_face_tracking": False,
            "prohibit_tab_switch": True,
            "max_warnings": 3
        }
    }, headers=t_headers)
    assert e_resp.status_code == 201
    exam_id = e_resp.json()["id"]

    # 4. JSON Import with Validation & Preview (Dry Run)
    questions_dataset = [
        {
            "question_text": "Which OSI layer provides reliable, end-to-end data delivery?",
            "question_type": "mcq",
            "options": ["Physical", "Data Link", "Transport", "Session"],
            "correct_option_index": 2,
            "marks": 2,
            "explanation": "Transport layer (Layer 4) guarantees flow control and error-free transmission."
        },
        {
            "question_text": "Which of the following are connectionless transport protocols? (Select all that apply)",
            "question_type": "multiple_select",
            "options": ["UDP", "TCP", "ICMP", "SCTP"],
            "correct_answers": [0, 2],
            "marks": 3,
            "explanation": "UDP and ICMP operate without connection state establishment."
        },
        {
            "question_text": "HTTP/2 uses binary framing instead of plain text delimiters.",
            "question_type": "true_false",
            "options": ["True", "False"],
            "correct_answers": ["True"],
            "marks": 1,
            "explanation": "HTTP/2 encapsulates headers and payload in binary frames."
        },
        {
            "question_text": "What does NAT stand for in networking?",
            "question_type": "short_answer",
            "options": [],
            "correct_answers": ["Network Address Translation"],
            "marks": 2,
            "explanation": "NAT maps local private IP addresses to routable public addresses."
        }
    ]

    # Test preview = true
    dry_run_resp = client.post(
        f"/api/v1/exams/{exam_id}/questions/import-json?preview=true",
        json=questions_dataset,
        headers=t_headers
    )
    assert dry_run_resp.status_code == 200
    dry_run_data = dry_run_resp.json()
    assert dry_run_data["total_valid"] == 4
    assert dry_run_data["is_preview"] is True

    # Test actual persistence (preview = false)
    import_resp = client.post(
        f"/api/v1/exams/{exam_id}/questions/import-json?preview=false",
        json=questions_dataset,
        headers=t_headers
    )
    assert import_resp.status_code == 200
    assert import_resp.json()["imported_count"] == 4

    # 5. Verify Export JSON
    export_resp = client.get(f"/api/v1/exams/{exam_id}/questions/export-json", headers=t_headers)
    assert export_resp.status_code == 200
    export_payload = export_resp.json()
    exported_questions = export_payload.get("questions", export_payload)
    assert len(exported_questions) == 4
    q_map = {q["question_text"]: q for q in exported_questions}
    assert q_map["Which OSI layer provides reliable, end-to-end data delivery?"]["question_type"] == "mcq"
    assert q_map["Which of the following are connectionless transport protocols? (Select all that apply)"]["question_type"] == "multiple_select"
    assert q_map["HTTP/2 uses binary framing instead of plain text delimiters."]["question_type"] == "true_false"
    assert q_map["What does NAT stand for in networking?"]["question_type"] == "short_answer"

    # Start the exam
    start_resp = client.post(f"/api/v1/exams/{exam_id}/start", headers=t_headers)
    assert start_resp.status_code == 200

    # 6. Setup 5 Simulated Students (Testing 5 simultaneous connections requirement)
    students = []
    for i in range(1, 6):
        stu_email = f"student_{i}_{unique}@satark.lan"
        s_reg = client.post("/api/v1/auth/register", json={
            "email": stu_email,
            "password": password,
            "full_name": f"Student Candidate {i}",
            "role": "student"
        })
        assert s_reg.status_code == 201

        s_log = client.post("/api/v1/auth/login", json={"email": stu_email, "password": password})
        assert s_log.status_code == 200
        s_token = s_log.json()["access_token"]
        s_headers = {"Authorization": f"Bearer {s_token}"}
        s_id = s_log.json()["user"]["id"]

        # Enroll in classroom using join code
        j_resp = client.post("/api/v1/classrooms/join", json={"join_code": join_code}, headers=s_headers)
        assert j_resp.status_code == 200

        # Simulate device registration (including Android for student 5)
        os_type = "Android 14" if i == 5 else "Windows 11"
        client.post("/api/v1/devices/register", json={
            "hardware_uuid": f"uuid-device-{i}-{unique}",
            "hostname": f"CANDIDATE-PC-{i}",
            "os_type": os_type,
            "agent_version": "1.0.0"
        }, headers=s_headers)

        # All 5 students stream their actual screen (including Android 14 via MediaProjection)
        # Student 5 also activates optional supplementary webcam
        client.post(f"/api/v1/media/{exam_id}/token", json={
            "can_publish": True,
            "is_camera": i == 5
        }, headers=s_headers)

        # Live streaming status: screen sharing is active for all 5 students
        client.post(f"/api/v1/media/{exam_id}/stream-state", json={
            "is_sharing": True,
            "is_camera_streaming": i == 5
        }, headers=s_headers)

        students.append({
            "id": s_id,
            "headers": s_headers,
            "index": i
        })

    # 7. Verify Teacher Live Monitoring Overview with 5 Simultaneous Students
    overview_resp = client.get(f"/api/v1/media/{exam_id}/overview", headers=t_headers)
    assert overview_resp.status_code == 200
    ov = overview_resp.json()
    assert ov["total_enrolled"] == 5
    assert len(ov["students"]) == 5
    assert ov["active_streamers"] == 5

    # 8. Test Student 1 Answering All Correctly & Submitting
    s1 = students[0]
    stu_questions_resp = client.get(f"/api/v1/exams/{exam_id}/questions", headers=s1["headers"])
    assert stu_questions_resp.status_code == 200
    stu_q_list = stu_questions_resp.json()
    assert len(stu_q_list) == 4
    q_by_text = {q["question_text"]: q for q in stu_q_list}

    q_transport = q_by_text["Which OSI layer provides reliable, end-to-end data delivery?"]
    q_multi = q_by_text["Which of the following are connectionless transport protocols? (Select all that apply)"]
    q_tf = q_by_text["HTTP/2 uses binary framing instead of plain text delimiters."]
    q_nat = q_by_text["What does NAT stand for in networking?"]

    # Save answers
    a1 = client.post(f"/api/v1/exams/{exam_id}/answers", json={
        "question_id": q_transport["id"],
        "selected_option_index": 2
    }, headers=s1["headers"])
    assert a1.status_code == 200

    a2 = client.post(f"/api/v1/exams/{exam_id}/answers", json={
        "question_id": q_multi["id"],
        "selected_options": [0, 2]
    }, headers=s1["headers"])
    assert a2.status_code == 200

    a3 = client.post(f"/api/v1/exams/{exam_id}/answers", json={
        "question_id": q_tf["id"],
        "selected_option_index": 0
    }, headers=s1["headers"])
    assert a3.status_code == 200

    a4 = client.post(f"/api/v1/exams/{exam_id}/answers", json={
        "question_id": q_nat["id"],
        "text_answer": "Network address translation"
    }, headers=s1["headers"])
    assert a4.status_code == 200

    # Submit Exam (Candidate response masks score until exam is ended by teacher)
    sub_resp = client.post(f"/api/v1/exams/{exam_id}/submit", json={}, headers=s1["headers"])
    assert sub_resp.status_code == 200
    sub_data = sub_resp.json()
    assert sub_data["status"] == "submitted"
    assert sub_data["score"] is None  # Score masked for student while exam is active
    sub_id = sub_data["id"]

    # 9. Verify Submission Review Breakdown (Teacher view contains score and question breakdown)
    review_resp = client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}/review", headers=t_headers)
    assert review_resp.status_code == 200
    review_data = review_resp.json()
    assert review_data["score"] == 8  # 2 + 3 + 1 + 2 = 8 marks (100%)
    assert review_data["total_marks"] == 8
    assert review_data["percentage"] == 100.0
    assert len(review_data["questions"]) == 4
    for q_rev in review_data["questions"]:
        assert q_rev["is_correct"] is True
        assert q_rev["marks_awarded"] == q_rev["marks"]

    # 10. Verify Reports CSV Export
    csv_resp = client.get(f"/api/v1/reports/exams/{exam_id}/export-csv", headers=t_headers)
    assert csv_resp.status_code == 200
    csv_text = csv_resp.text
    assert "Student Candidate 1" in csv_text
    assert "100%" in csv_text
