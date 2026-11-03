import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.config import settings

client = TestClient(app)

def test_exam_results_publishing_and_pdf():
    # 1. Register Teacher
    t_email = f"prof_pdf_{pytest.importorskip('uuid').uuid4().hex[:6]}@satark.edu"
    t_res = client.post("/api/v1/auth/register", json={
        "email": t_email,
        "password": "Password123!",
        "full_name": "Prof PDF Evaluator",
        "role": "teacher",
        "teacher_provisioning_key": settings.TEACHER_PROVISIONING_KEY
    })
    assert t_res.status_code == 201

    t_login = client.post("/api/v1/auth/login", json={"email": t_email, "password": "Password123!"})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {t_token}"}

    # 2. Register Student
    s_email = f"stu_pdf_{pytest.importorskip('uuid').uuid4().hex[:6]}@satark.edu"
    s_res = client.post("/api/v1/auth/register", json={
        "email": s_email,
        "password": "Password123!",
        "full_name": "Candidate PDF Test",
        "role": "student"
    })
    assert s_res.status_code == 201

    s_login = client.post("/api/v1/auth/login", json={"email": s_email, "password": "Password123!"})
    assert s_login.status_code == 200
    s_token = s_login.json()["access_token"]
    s_headers = {"Authorization": f"Bearer {s_token}"}

    # 3. Create Classroom & Enroll Student
    c_res = client.post("/api/v1/classrooms", headers=t_headers, json={
        "title": "Distributed Systems Lab",
        "subject_code": "CS401",
        "description": "Lab section"
    })
    assert c_res.status_code == 201
    classroom_id = c_res.json()["id"]
    join_code = c_res.json()["join_code"]

    join_res = client.post("/api/v1/classrooms/join", headers=s_headers, json={"join_code": join_code})
    assert join_res.status_code == 200

    # 4. Create Exam Session
    exam_res = client.post("/api/v1/exams", headers=t_headers, json={
        "classroom_id": classroom_id,
        "title": "Systems Midterm Exam",
        "duration_minutes": 45,
        "policy_config": {"strict_mode": True}
    })
    assert exam_res.status_code == 201
    exam_id = exam_res.json()["id"]
    exam_code = exam_res.json()["exam_code"]

    # 5. Add Questions: 1 MCQ and 1 Short Answer
    q1_res = client.post(f"/api/v1/exams/{exam_id}/questions", headers=t_headers, json={
        "question_text": "What is the primary benefit of SQLite WAL mode?",
        "question_type": "mcq",
        "options": ["Faster concurrent readers and writer", "Network sync", "Cloud storage", "Encrypted tables"],
        "correct_option_index": 0,
        "marks": 5,
        "order_num": 1,
        "explanation": "WAL allows concurrent reading while a transaction is writing."
    })
    assert q1_res.status_code == 201
    q1_id = q1_res.json()["id"]

    q2_res = client.post(f"/api/v1/exams/{exam_id}/questions", headers=t_headers, json={
        "question_text": "Define the CAP theorem in one sentence.",
        "question_type": "short_answer",
        "options": [],
        "correct_answers": ["consistency availability partition tolerance"],
        "marks": 10,
        "order_num": 2,
        "explanation": "Tradeoff between consistency and availability under partition."
    })
    assert q2_res.status_code == 201
    q2_id = q2_res.json()["id"]

    # 6. Start Exam
    start_res = client.post(f"/api/v1/exams/{exam_id}/start", headers=t_headers)
    assert start_res.status_code == 200

    # 7. Student Submits Exam
    sub_res = client.post(f"/api/v1/exams/{exam_id}/submit", headers=s_headers, json={
        "answers": [
            {"question_id": q1_id, "selected_option_index": 0},
            {"question_id": q2_id, "text_answer": "In a distributed system, you can only guarantee two out of consistency, availability, and partition tolerance."}
        ]
    })
    assert sub_res.status_code == 200
    submission_id = sub_res.json()["id"]
    # Results are not published yet, so score is masked for student
    assert sub_res.json()["score"] is None

    # Student cannot view review before publishing
    rev_blocked = client.get(f"/api/v1/exams/{exam_id}/submissions/{submission_id}/review", headers=s_headers)
    assert rev_blocked.status_code == 403

    # Student cannot download PDF before publishing
    pdf_blocked = client.get(f"/api/v1/reports/exams/{exam_id}/submissions/{submission_id}/pdf", headers=s_headers)
    assert pdf_blocked.status_code == 403

    # Teacher CAN view review and download PDF before publishing
    teacher_rev = client.get(f"/api/v1/exams/{exam_id}/submissions/{submission_id}/review", headers=t_headers)
    assert teacher_rev.status_code == 200
    assert teacher_rev.json()["score"] == 5  # Only MCQ auto-graded initially

    # 8. Teacher manually grades subjective Short Answer question (Q2)
    grade_res = client.put(
        f"/api/v1/exams/{exam_id}/submissions/{submission_id}/answers/{q2_id}/grade",
        headers=t_headers,
        json={"manual_score": 10, "feedback": "Comprehensive and accurate definition of CAP tradeoffs."}
    )
    assert grade_res.status_code == 200
    assert grade_res.json()["score"] == 15
    assert grade_res.json()["percentage"] == 100.0

    # 9. Teacher Publishes Exam Results
    pub_res = client.post(f"/api/v1/exams/{exam_id}/publish-results", headers=t_headers, json={"passing_percentage": 50})
    assert pub_res.status_code == 200
    assert pub_res.json()["is_results_published"] is True

    # 10. Student CAN now view review and see their published results & feedback
    student_rev = client.get(f"/api/v1/exams/{exam_id}/submissions/{submission_id}/review", headers=s_headers)
    assert student_rev.status_code == 200
    data = student_rev.json()
    assert data["score"] == 15
    assert data["percentage"] == 100.0
    assert data["is_passed"] is True
    assert data["is_results_published"] is True
    # Verify manual score and feedback appear on Q2
    q2_rev = next(q for q in data["questions"] if q["question_id"] == q2_id)
    assert q2_rev["manual_score"] == 10
    assert "Comprehensive and accurate" in q2_rev["feedback"]

    # 11. Student Downloads Certified Result PDF
    pdf_res = client.get(f"/api/v1/reports/exams/{exam_id}/submissions/{submission_id}/pdf", headers=s_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")
    assert len(pdf_res.content) > 1000

    # Test alternate exam-prefixed route
    alt_pdf = client.get(f"/api/v1/exams/{exam_id}/submissions/{submission_id}/pdf", headers=s_headers)
    assert alt_pdf.status_code == 200
    assert alt_pdf.content.startswith(b"%PDF")
