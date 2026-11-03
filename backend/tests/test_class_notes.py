import os
import io
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.class_notes_storage import class_notes_storage

client = TestClient(app)


def test_class_notes_full_lifecycle():
    unique = uuid.uuid4().hex[:8]
    teacher_email = f"teacher_notes_{unique}@satark.edu"
    student_a_email = f"student_enrolled_{unique}@satark.edu"
    student_b_email = f"student_unenrolled_{unique}@satark.edu"
    password = "SecurePassword123!"

    # 1. Register Teacher
    t_reg = client.post("/api/v1/auth/register", json={
        "email": teacher_email,
        "password": password,
        "full_name": "Prof. Notes Instructor",
        "role": "teacher",
        "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026"
    })
    assert t_reg.status_code == 201
    t_login = client.post("/api/v1/auth/login", json={"email": teacher_email, "password": password})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_headers = {"Authorization": f"Bearer {t_token}"}

    # 2. Register Student A (enrolled)
    sa_reg = client.post("/api/v1/auth/register", json={
        "email": student_a_email,
        "password": password,
        "full_name": "Enrolled Candidate",
        "role": "student"
    })
    assert sa_reg.status_code == 201
    sa_login = client.post("/api/v1/auth/login", json={"email": student_a_email, "password": password})
    sa_token = sa_login.json()["access_token"]
    sa_headers = {"Authorization": f"Bearer {sa_token}"}

    # 3. Register Student B (not enrolled)
    sb_reg = client.post("/api/v1/auth/register", json={
        "email": student_b_email,
        "password": password,
        "full_name": "Unenrolled Candidate",
        "role": "student"
    })
    assert sb_reg.status_code == 201
    sb_login = client.post("/api/v1/auth/login", json={"email": student_b_email, "password": password})
    sb_token = sb_login.json()["access_token"]
    sb_headers = {"Authorization": f"Bearer {sb_token}"}

    # 4. Teacher creates Classroom
    cls_resp = client.post("/api/v1/classrooms", headers=t_headers, json={
        "title": f"Computer Architecture {unique}",
        "subject_code": "CS-301",
        "description": "Processor architecture and cache hierarchies"
    })
    assert cls_resp.status_code == 201
    classroom = cls_resp.json()
    class_id = classroom["id"]
    join_code = classroom["join_code"]

    # 5. Student A joins Classroom
    join_resp = client.post("/api/v1/classrooms/join", headers=sa_headers, json={"join_code": join_code})
    assert join_resp.status_code == 200

    # 6. Negative Test: Student attempts to upload note -> 403 Forbidden
    fake_pdf = io.BytesIO(b"%PDF-1.4 Mock PDF content for lecture 1")
    bad_upload = client.post(
        f"/api/v1/classrooms/{class_id}/notes",
        headers=sa_headers,
        data={"title": "Unauthorized Upload", "category": "Lecture Notes", "is_published": True},
        files={"file": ("lecture1.pdf", fake_pdf, "application/pdf")}
    )
    assert bad_upload.status_code == 403

    # 7. Negative Test: Teacher uploads unsupported file extension (e.g., .exe) -> 400 Bad Request
    bad_ext_file = io.BytesIO(b"MZ executable content")
    bad_ext_resp = client.post(
        f"/api/v1/classrooms/{class_id}/notes",
        headers=t_headers,
        data={"title": "Malware file", "category": "Lecture Notes"},
        files={"file": ("malware.exe", bad_ext_file, "application/octet-stream")}
    )
    assert bad_ext_resp.status_code == 400
    assert "Unsupported file format" in bad_ext_resp.json()["detail"]

    # 8. Teacher uploads legitimate PDF note
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Module 1 Notes) >>\nendobj\n%%EOF"
    upload_resp = client.post(
        f"/api/v1/classrooms/{class_id}/notes",
        headers=t_headers,
        data={
            "title": "Module 1: Pipeline Hazards & Forwarding",
            "description": "Comprehensive notes covering structural, data and control hazards.",
            "subject": "CS-301",
            "category": "Lecture Notes",
            "is_published": "true"
        },
        files={"file": ("Pipeline_Hazards.pdf", io.BytesIO(pdf_content), "application/pdf")}
    )
    assert upload_resp.status_code == 201
    note1 = upload_resp.json()
    assert note1["title"] == "Module 1: Pipeline Hazards & Forwarding"
    assert note1["file_extension"] == ".pdf"
    assert note1["file_size_bytes"] == len(pdf_content)
    assert note1["is_published"] is True
    assert note1["download_count"] == 0
    note1_id = note1["id"]

    # Verify physical file exists in SATARK_STORAGE_DIR/class_notes/{class_id}/{note_id}/
    note_dir = class_notes_storage.get_note_directory(class_id, note1_id)
    assert note_dir.exists()
    assert any(note_dir.glob("*.pdf"))

    # 9. Teacher uploads a Draft/Unpublished note
    draft_resp = client.post(
        f"/api/v1/classrooms/{class_id}/notes",
        headers=t_headers,
        data={
            "title": "Midterm Exam Cheatsheet (Draft)",
            "description": "Unpublished formula sheet",
            "subject": "CS-301",
            "category": "Cheatsheet",
            "is_published": "false"
        },
        files={"file": ("cheatsheet.txt", io.BytesIO(b"Cache Formula: AMAT = Hit Time + (Miss Rate * Miss Penalty)"), "text/plain")}
    )
    assert draft_resp.status_code == 201
    draft_note = draft_resp.json()
    draft_id = draft_note["id"]
    assert draft_note["is_published"] is False

    # 10. Teacher lists classroom notes -> sees both published and draft (2 notes)
    t_list = client.get(f"/api/v1/classrooms/{class_id}/notes", headers=t_headers)
    assert t_list.status_code == 200
    assert len(t_list.json()) == 2

    # 11. Student A (enrolled) lists classroom notes -> sees ONLY published (1 note)
    sa_list = client.get(f"/api/v1/classrooms/{class_id}/notes", headers=sa_headers)
    assert sa_list.status_code == 200
    assert len(sa_list.json()) == 1
    assert sa_list.json()[0]["id"] == note1_id

    # 12. Student B (not enrolled) lists classroom notes -> 403 Forbidden
    sb_list = client.get(f"/api/v1/classrooms/{class_id}/notes", headers=sb_headers)
    assert sb_list.status_code == 403

    # 13. Student A previews the note -> 200 OK with inline disposition
    prev_resp = client.get(f"/api/v1/notes/{note1_id}/preview", headers=sa_headers)
    assert prev_resp.status_code == 200
    assert prev_resp.headers["content-type"] == "application/pdf"
    assert "inline" in prev_resp.headers["content-disposition"]
    assert prev_resp.content == pdf_content

    # Preview with query param token fallback (for browser tabs / iframes)
    prev_param = client.get(f"/api/v1/notes/{note1_id}/preview?token={sa_token}")
    assert prev_param.status_code == 200

    # 14. Student A downloads the note -> 200 OK, attachment disposition, increments download count
    down_resp = client.get(f"/api/v1/notes/{note1_id}/download", headers=sa_headers)
    assert down_resp.status_code == 200
    assert "attachment" in down_resp.headers["content-disposition"]
    assert down_resp.content == pdf_content

    # Verify download count incremented
    check_note = client.get(f"/api/v1/notes/{note1_id}", headers=t_headers)
    assert check_note.status_code == 200
    assert check_note.json()["download_count"] == 1

    # 15. Student A checks aggregated enrolled notes hub (`/api/v1/notes/student/enrolled`)
    hub_resp = client.get("/api/v1/notes/student/enrolled", headers=sa_headers)
    assert hub_resp.status_code == 200
    assert len(hub_resp.json()) == 1
    assert hub_resp.json()[0]["classroom_title"] == f"Computer Architecture {unique}"

    # Search filter test on student hub
    search_resp = client.get("/api/v1/notes/student/enrolled?search=Hazards", headers=sa_headers)
    assert search_resp.status_code == 200
    assert len(search_resp.json()) == 1

    empty_search = client.get("/api/v1/notes/student/enrolled?search=NonExistentKeyword", headers=sa_headers)
    assert empty_search.status_code == 200
    assert len(empty_search.json()) == 0

    # 16. Teacher updates draft note to published
    patch_resp = client.patch(
        f"/api/v1/notes/{draft_id}",
        headers=t_headers,
        json={"is_published": True, "title": "Midterm Exam Cheatsheet (Published)"}
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["is_published"] is True
    assert patch_resp.json()["title"] == "Midterm Exam Cheatsheet (Published)"

    # Student A now sees 2 notes
    sa_list_updated = client.get(f"/api/v1/classrooms/{class_id}/notes", headers=sa_headers)
    assert len(sa_list_updated.json()) == 2

    # 17. Teacher replaces file of note 1
    new_pdf = b"%PDF-1.4\nNew revision of pipeline hazards note.\n%%EOF"
    replace_resp = client.post(
        f"/api/v1/notes/{note1_id}/replace-file",
        headers=t_headers,
        files={"file": ("Pipeline_Hazards_v2.pdf", io.BytesIO(new_pdf), "application/pdf")}
    )
    assert replace_resp.status_code == 200
    assert replace_resp.json()["original_filename"] == "Pipeline_Hazards_v2.pdf"
    assert replace_resp.json()["file_size_bytes"] == len(new_pdf)

    # 18. Teacher batch uploads multiple notes at once
    batch_resp = client.post(
        f"/api/v1/classrooms/{class_id}/notes/batch",
        headers=t_headers,
        data={"category": "Reference", "subject": "CS-301"},
        files=[
            ("files", ("Instruction_Set.txt", io.BytesIO(b"MIPS R-type I-type J-type instructions"), "text/plain")),
            ("files", ("Datapath_Diagram.png", io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRmock"), "image/png"))
        ]
    )
    assert batch_resp.status_code == 201
    batch_notes = batch_resp.json()
    assert len(batch_notes) == 2

    # 19. Teacher deletes draft_note
    del_resp = client.delete(f"/api/v1/notes/{draft_id}", headers=t_headers)
    assert del_resp.status_code == 200

    # Confirm deletion
    get_del = client.get(f"/api/v1/notes/{draft_id}", headers=t_headers)
    assert get_del.status_code == 404
