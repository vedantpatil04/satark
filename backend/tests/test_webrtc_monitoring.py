import os
import json
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_webrtc_signaling_and_monitoring_flow():
    unique = os.getpid() + 888
    teacher_email = f"prof_webrtc_{unique}@satark.lan"
    student_email = f"student_webrtc_{unique}@satark.lan"
    password = "SecurePassword123!"

    # 1. Register and Login Teacher
    t_reg = client.post("/api/v1/auth/register", json={
        "email": teacher_email,
        "password": password,
        "full_name": "Dr. Claude Shannon",
        "role": "teacher",
        "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026"
    })
    assert t_reg.status_code == 201
    t_login = client.post("/api/v1/auth/login", json={"email": teacher_email, "password": password})
    assert t_login.status_code == 200
    t_token = t_login.json()["access_token"]
    t_id = t_login.json()["user"]["id"]
    t_headers = {"Authorization": f"Bearer {t_token}"}

    # 2. Register and Login Student
    s_reg = client.post("/api/v1/auth/register", json={
        "email": student_email,
        "password": password,
        "full_name": "Ada Lovelace",
        "role": "student"
    })
    assert s_reg.status_code == 201
    s_login = client.post("/api/v1/auth/login", json={"email": student_email, "password": password})
    assert s_login.status_code == 200
    s_token = s_login.json()["access_token"]
    s_id = s_login.json()["user"]["id"]
    s_headers = {"Authorization": f"Bearer {s_token}"}

    # 3. Create Classroom & Exam
    c_resp = client.post("/api/v1/classrooms", json={
        "title": f"WebRTC Lab {unique}",
        "subject_code": "CS-502",
        "description": "Real-time media streaming"
    }, headers=t_headers)
    assert c_resp.status_code == 201
    classroom_id = c_resp.json()["id"]
    join_code = c_resp.json()["join_code"]

    # Student joins classroom
    j_resp = client.post("/api/v1/classrooms/join", json={"join_code": join_code}, headers=s_headers)
    assert j_resp.status_code == 200

    # Teacher creates exam
    e_resp = client.post("/api/v1/exams", json={
        "classroom_id": classroom_id,
        "title": "Real-time Protocols Assessment",
        "duration_minutes": 45,
        "scheduled_start": "2026-11-01T14:00:00Z"
    }, headers=t_headers)
    assert e_resp.status_code == 201
    exam_id = e_resp.json()["id"]

    # Teacher starts exam
    start_resp = client.post(f"/api/v1/exams/{exam_id}/start", headers=t_headers)
    assert start_resp.status_code == 200

    # 4. Acquire WebSocket Tickets
    t_ticket_resp = client.post("/api/v1/auth/ws-ticket", json={"channel": "teacher"}, headers=t_headers)
    assert t_ticket_resp.status_code == 200
    t_ticket = t_ticket_resp.json()["ticket"]

    s_ticket_resp = client.post("/api/v1/auth/ws-ticket", json={"channel": "student"}, headers=s_headers)
    assert s_ticket_resp.status_code == 200
    s_ticket = s_ticket_resp.json()["ticket"]

    # 5. Connect Teacher & Student WebSockets and simulate WebRTC signaling
    with client.websocket_connect(f"/ws/teacher?ticket={t_ticket}", headers={"Origin": "http://localhost:5174"}) as ws_teacher:
        with client.websocket_connect(f"/ws/student?ticket={s_ticket}", headers={"Origin": "http://localhost:5173"}) as ws_student:
            # Teacher requests media streaming from student
            ws_teacher.send_text(json.dumps({
                "type": "screen_share_request",
                "student_id": s_id,
                "exam_id": exam_id
            }))

            # Student receives request
            msg_for_student = json.loads(ws_student.receive_text())
            assert msg_for_student["type"] == "screen_share_request"
            assert msg_for_student["exam_id"] == exam_id

            # Student sends screen_share_accepted
            ws_student.send_text(json.dumps({
                "type": "screen_share_accepted",
                "teacher_id": t_id,
                "exam_id": exam_id
            }))

            # Teacher receives acceptance
            msg_for_teacher = json.loads(ws_teacher.receive_text())
            assert msg_for_teacher["type"] == "screen_share_accepted"

            # Student generates SDP offer with dual stream track metadata
            scr_track_id = "track_scr_12345"
            cam_track_id = "track_cam_67890"
            ws_student.send_text(json.dumps({
                "type": "webrtc_offer",
                "target_user_id": t_id,
                "sdp": {"type": "offer", "sdp": "v=0\r\no=satark ..."},
                "exam_id": exam_id,
                "stream_type": "both",
                "screen_track_id": scr_track_id,
                "camera_track_id": cam_track_id,
                "screen_stream_id": "stream_screen",
                "camera_stream_id": "stream_camera"
            }))

            # Teacher receives webrtc_offer
            offer_msg = json.loads(ws_teacher.receive_text())
            assert offer_msg["type"] == "webrtc_offer"
            assert offer_msg["stream_type"] == "both"
            assert offer_msg["screen_track_id"] == scr_track_id
            assert offer_msg["camera_track_id"] == cam_track_id

            # Teacher responds with webrtc_answer
            ws_teacher.send_text(json.dumps({
                "type": "webrtc_answer",
                "target_user_id": s_id,
                "sdp": {"type": "answer", "sdp": "v=0\r\no=teacher ..."},
                "exam_id": exam_id
            }))

            # Student receives answer
            answer_msg = json.loads(ws_student.receive_text())
            assert answer_msg["type"] == "webrtc_answer"

            # Student & Teacher exchange ICE candidates
            ws_student.send_text(json.dumps({
                "type": "ice_candidate",
                "target_user_id": t_id,
                "candidate": {"candidate": "candidate:1 1 UDP ...", "sdpMid": "0"},
                "exam_id": exam_id
            }))

            candidate_for_teacher = json.loads(ws_teacher.receive_text())
            assert candidate_for_teacher["type"] == "ice_candidate"

            # Student updates stream state via REST API
            stream_state_resp = client.post(f"/api/v1/media/{exam_id}/stream-state", json={
                "is_sharing": True,
                "is_camera": True
            }, headers=s_headers)
            assert stream_state_resp.status_code == 200

            # Teacher receives real-time stream state notification
            stream_state_ws = json.loads(ws_teacher.receive_text())
            assert stream_state_ws["type"] == "student_stream_state"
            assert stream_state_ws["is_sharing_screen"] is True
            assert stream_state_ws["is_camera_on"] is True
            assert stream_state_ws["is_camera_streaming"] is True

            # Verify Overview reflects live streaming
            ov_resp = client.get(f"/api/v1/media/{exam_id}/overview", headers=t_headers)
            assert ov_resp.status_code == 200
            ov = ov_resp.json()
            assert ov["active_streamers"] == 1
            st_data = ov["students"][0]
            assert st_data["student_id"] == s_id
            assert st_data["is_sharing_screen"] is True
            assert st_data["is_camera_streaming"] is True

