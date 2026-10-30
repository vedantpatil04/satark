import os
import json
import uuid
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_question_bank_and_canonical_json_lifecycle():
    unique = os.getpid()
    teacher_email = f"qb_teacher_{unique}@school.edu"
    student_email = f"qb_student_{unique}@school.edu"
    password = "SecurePassword123!"

    # 1. Register Teacher
    t_reg = client.post("/api/v1/auth/register", json={
        "email": teacher_email,
        "password": password,
        "full_name": "Dr. Proctored Teacher",
        "role": "teacher",
        "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026"
    })
    assert t_reg.status_code == 201

    t_login = client.post("/api/v1/auth/login", json={"email": teacher_email, "password": password})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {t_token}"}

    # 2. Register Student
    s_reg = client.post("/api/v1/auth/register", json={
        "email": student_email,
        "password": password,
        "full_name": "Honest Student",
        "role": "student"
    })
    assert s_reg.status_code == 201
    s_login = client.post("/api/v1/auth/login", json={"email": student_email, "password": password})
    assert s_login.status_code == 200
    s_token = s_login.json()["access_token"]
    s_headers = {"Authorization": f"Bearer {s_token}"}

    # 3. Download / Get Canonical Template
    tpl_resp = client.get("/api/v1/question-banks/template")
    assert tpl_resp.status_code == 200
    tpl = tpl_resp.json()
    assert tpl["schemaVersion"] == "1.0"
    assert len(tpl["questions"]) >= 2

    # 4. Validate Malformed Dataset (Negative Test)
    bad_dataset = {
        "schemaVersion": "2.0",  # invalid version
        "title": "",            # missing title
        "subject": "CS",
        "questions": [
            {
                "externalId": "BAD-01",
                "type": "essay",  # unsupported type
                "question": "Explain relativity",
                "options": ["Single"],  # less than 2 options
                "correctOptionIndex": 5, # out of bounds
                "marks": -1,             # negative marks
                "difficulty": "super_hard" # invalid difficulty
            }
        ]
    }
    val_resp = client.post("/api/v1/question-banks/validate-json", json=bad_dataset, headers=t_headers)
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["valid"] is False
    assert val_data["invalid_count"] > 0
    assert len(val_data["errors"]) >= 3

    # 5. Validate Valid Canonical Dataset
    valid_dataset = {
        "schemaVersion": "1.0",
        "title": "Systems & Database Engineering",
        "subject": "Computer Science",
        "topic": "Storage & Concurrency",
        "description": "Mid-term university dataset",
        "questions": [
            {
                "externalId": f"EXT-101-{unique}",
                "type": "mcq",
                "question": "What does the ACID 'I' stand for in database transactions?",
                "options": ["Integrity", "Isolation", "Iteration", "Idempotency"],
                "correctOptionIndex": 1,
                "marks": 2,
                "negativeMarks": 0,
                "difficulty": "medium",
                "topic": "Databases",
                "explanation": "Isolation ensures concurrent execution leaves system in consistent state."
            },
            {
                "externalId": f"EXT-102-{unique}",
                "type": "mcq",
                "question": "Which system call creates a duplicate child process in UNIX?",
                "options": ["fork()", "exec()", "pthread_create()", "clone()"],
                "correctOptionIndex": 0,
                "marks": 2,
                "negativeMarks": 1,
                "difficulty": "easy",
                "topic": "Operating Systems",
                "explanation": "fork() creates an exact duplicate process."
            }
        ]
    }
    good_val_resp = client.post("/api/v1/question-banks/validate-json", json=valid_dataset, headers=t_headers)
    assert good_val_resp.status_code == 200
    assert good_val_resp.json()["valid"] is True
    assert good_val_resp.json()["valid_count"] == 2

    # 6. Import Valid Dataset atomically
    import_resp = client.post("/api/v1/question-banks/import-json", json={"dataset": valid_dataset}, headers=t_headers)
    assert import_resp.status_code == 201
    bank_data = import_resp.json()
    bank_id = bank_data["id"]
    assert bank_data["item_count"] == 2
    assert bank_data["total_marks"] == 4
    assert len(bank_data["items"]) == 2

    # 7. Add a manual item to the bank
    add_item_resp = client.post(f"/api/v1/question-banks/{bank_id}/items", json={
        "external_id": f"EXT-103-{unique}",
        "question_text": "What is the primary function of DNS?",
        "options": ["Translate domain names to IP addresses", "Encrypt web traffic", "Host HTML files", "Route packets"],
        "correct_option_index": 0,
        "marks": 1,
        "difficulty": "easy",
        "topic": "Networks"
    }, headers=t_headers)
    assert add_item_resp.status_code == 201
    new_item_id = add_item_resp.json()["id"]

    # 8. Export Question Bank as Canonical JSON
    export_resp = client.get(f"/api/v1/question-banks/{bank_id}/export", headers=t_headers)
    assert export_resp.status_code == 200
    exp_data = export_resp.json()
    assert exp_data["schemaVersion"] == "1.0"
    assert len(exp_data["questions"]) == 3

    # 9. Create Classroom and Exam
    cls_resp = client.post("/api/v1/classrooms", json={
        "title": "CS-401 Advanced Systems",
        "subject_code": "CS401",
        "description": "Exam cohort"
    }, headers=t_headers)
    assert cls_resp.status_code == 201
    classroom_id = cls_resp.json()["id"]
    join_code = cls_resp.json()["join_code"]

    # Student joins classroom
    join_resp = client.post("/api/v1/classrooms/join", json={"join_code": join_code}, headers=s_headers)
    assert join_resp.status_code == 200

    # Teacher creates Exam
    exam_resp = client.post("/api/v1/exams", json={
        "classroom_id": classroom_id,
        "title": "Systems Final Examination",
        "duration_minutes": 90,
        "policy_config": {"prohibit_tab_switch": True}
    }, headers=t_headers)
    assert exam_resp.status_code == 201
    exam_id = exam_resp.json()["id"]
    exam_code = exam_resp.json()["exam_code"]

    # 10. Import items from Question Bank into Exam
    item_ids = [it["id"] for it in bank_data["items"]] + [new_item_id]
    import_to_exam_resp = client.post(
        f"/api/v1/exams/{exam_id}/import-from-bank",
        json={"item_ids": item_ids},
        headers=t_headers
    )
    assert import_to_exam_resp.status_code == 200
    exam_questions = import_to_exam_resp.json()
    assert len(exam_questions) == 3

    # 11. Freeze snapshot explicitly
    snap_resp = client.post(f"/api/v1/exams/{exam_id}/snapshot", headers=t_headers)
    assert snap_resp.status_code == 200
    snapshot = snap_resp.json()
    assert snapshot["total_questions"] == 3
    assert snapshot["total_marks"] == 5

    # 12. Student joins exam
    exam_join = client.post(f"/api/v1/exams/{exam_id}/join", json={"exam_code": exam_code}, headers=s_headers)
    assert exam_join.status_code == 200

    # 13. Teacher starts exam
    start_resp = client.post(f"/api/v1/exams/{exam_id}/start", headers=t_headers)
    assert start_resp.status_code == 200

    # 14. Verify student question response NEVER exposes correctOptionIndex
    student_q_resp = client.get(f"/api/v1/exams/{exam_id}/questions", headers=s_headers)
    assert student_q_resp.status_code == 200
    for q in student_q_resp.json():
        assert q["correct_option_index"] is None, "SECURITY VIOLATION: Student received correct option index!"

    # Also verify student snapshot response withholds answers
    student_snap_resp = client.get(f"/api/v1/exams/{exam_id}/snapshot", headers=s_headers)
    assert student_snap_resp.status_code == 200
    for sq in student_snap_resp.json()["snapshot_data"]:
        assert "correct_option_index" not in sq, "SECURITY VIOLATION: Student received answer key in snapshot!"

    # 15. LiveKit WebRTC Token Issuance & Permissions
    # Teacher token: can_subscribe=True, can_publish=False
    teacher_tok_resp = client.post(f"/api/v1/media/{exam_id}/token", headers=t_headers)
    assert teacher_tok_resp.status_code == 200
    t_tok_data = teacher_tok_resp.json()
    assert t_tok_data["role"] == "teacher"
    assert t_tok_data["can_subscribe"] is True
    assert t_tok_data["can_publish"] is False
    assert t_tok_data["room_name"] == f"satark-exam-{exam_id}"

    # Student token: can_subscribe=False, can_publish=True
    student_tok_resp = client.post(f"/api/v1/media/{exam_id}/token", headers=s_headers)
    assert student_tok_resp.status_code == 200
    s_tok_data = student_tok_resp.json()
    assert s_tok_data["role"] == "student"
    assert s_tok_data["can_subscribe"] is False, "PRIVACY VIOLATION: Student should not subscribe to other streams"
    assert s_tok_data["can_publish"] is True

    # 16. Teacher Monitoring Overview
    overview_resp = client.get(f"/api/v1/media/{exam_id}/overview", headers=t_headers)
    assert overview_resp.status_code == 200
    overview = overview_resp.json()
    assert overview["total_enrolled"] >= 1
    assert len(overview["students"]) >= 1

    # 17. Teacher requests screen sharing
    req_share_resp = client.post(f"/api/v1/media/{exam_id}/request-share", json={}, headers=t_headers)
    assert req_share_resp.status_code == 200

    # 18. Student consents and approves screen sharing
    consent_resp = client.post(f"/api/v1/media/{exam_id}/share-response", json={"approved": True}, headers=s_headers)
    assert consent_resp.status_code == 200
    assert consent_resp.json()["status"] == "approved"

    # 19. Student starts stream state
    stream_resp = client.post(f"/api/v1/media/{exam_id}/stream-state", json={"is_sharing": True}, headers=s_headers)
    assert stream_resp.status_code == 200
    assert stream_resp.json()["is_sharing"] is True

    # Teacher overview now shows 1 active streamer
    overview_after = client.get(f"/api/v1/media/{exam_id}/overview", headers=t_headers).json()
    assert overview_after["active_streamers"] >= 1

    # 20. Student stops stream
    stop_resp = client.post(f"/api/v1/media/{exam_id}/stream-state", json={"is_sharing": False}, headers=s_headers)
    assert stop_resp.status_code == 200

    # 21. Teacher broadcasts announcement
    bc_resp = client.post(f"/api/v1/media/{exam_id}/broadcast", json={
        "message": "Attention: 15 minutes remaining. Please verify all questions are answered.",
        "priority": "urgent"
    }, headers=t_headers)
    assert bc_resp.status_code == 200
    assert bc_resp.json()["recipient_count"] >= 1

