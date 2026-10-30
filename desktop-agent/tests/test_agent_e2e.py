import os
import sys
import tempfile
import pytest
from fastapi.testclient import TestClient

# Add project root and desktop-agent to path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("desktop-agent"))

from backend.app.main import app
from backend.app.core.database import Base, engine
from src.common.config import AgentConfig
from src.common.identity import get_device_identity
from src.common.pairing import pair_device
from src.common.api_client import ApiClient
from src.common.event_envelope import create_app_changed_envelope

client = TestClient(app)


def test_desktop_agent_full_e2e_pipeline(monkeypatch):
    """
    Validates complete end-to-end flow:
    Student login -> Pairing Code -> Agent Pairing -> WS Ticket -> Heartbeat -> Event Ingest -> Teacher Visibility -> Revocation.
    """
    # 1. Create student account
    unique_num = os.getpid()
    student_payload = {
        "email": f"agent_student_{unique_num}@school.edu",
        "password": "Password123!",
        "full_name": "Agent Test Student",
    }
    reg_resp = client.post("/api/v1/auth/register", json=student_payload)
    assert reg_resp.status_code == 201

    login_resp = client.post("/api/v1/auth/login", json={
        "email": student_payload["email"],
        "password": student_payload["password"],
    })
    assert login_resp.status_code == 200
    student_token = login_resp.json()["access_token"]
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # 2. Student requests Pairing Code from Student Portal
    pair_code_resp = client.post("/api/v1/devices/pairing-code", headers=student_headers)
    assert pair_code_resp.status_code == 200
    pairing_code = pair_code_resp.json()["pairing_code"]
    assert len(pairing_code) == 6

    # 3. Desktop Agent pairs using the code
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        temp_cfg = tf.name

    try:
        config = AgentConfig(config_path=temp_cfg)
        identity = get_device_identity()

        pair_req_payload = {
            "pairing_code": pairing_code,
            "hardware_uuid": identity["hardware_uuid"],
            "hostname": identity["hostname"],
            "os_type": identity["os_type"],
            "os_version": identity["os_version"],
            "agent_version": "1.0.0",
        }
        pair_post_resp = client.post("/api/v1/devices/pair", json=pair_req_payload)
        assert pair_post_resp.status_code == 200
        paired_data = pair_post_resp.json()
        assert paired_data["status"] == "connected"
        assert paired_data["student_name"] == "Agent Test Student"

        # Save to agent config
        config.save(paired_data)
        assert config.is_paired() is True

        # 4. Agent requests WS ticket
        agent_headers = {"Authorization": f"Bearer {config.device_token}"}
        ticket_resp = client.post("/api/v1/devices/ws-ticket", headers=agent_headers)
        assert ticket_resp.status_code == 200
        ticket = ticket_resp.json()["ticket"]
        assert ticket.startswith("tkt_")

        # 5. Agent sends Heartbeat
        hb_resp = client.post(
            f"/api/v1/devices/{config.device_id}/heartbeat",
            json={"agent_version": "1.0.0"},
            headers=agent_headers,
        )
        assert hb_resp.status_code == 200
        assert hb_resp.json()["is_connected"] is True

        # 6. Agent sends Event Envelope
        event = create_app_changed_envelope(
            device_id=config.device_id,
            student_id=config.student_id,
            process_name="calculator.exe",
        )
        event_batch_resp = client.post(
            "/api/v1/devices/events",
            json={"events": [event]},
            headers=agent_headers,
        )
        assert event_batch_resp.status_code == 200
        assert event_batch_resp.json()["persisted"] == 1

        # 7. Create Teacher and inspect device grid
        teacher_email = f"agent_teacher_{unique_num}@school.edu"
        teacher_pass = "Password123!"
        teacher_reg = client.post("/api/v1/auth/register", json={
            "email": teacher_email,
            "password": teacher_pass,
            "full_name": "Agent Test Teacher",
            "role": "teacher",
            "teacher_provisioning_key": "TEACHER-SECURE-KEY-2026",
        })
        assert teacher_reg.status_code == 201

        teacher_login = client.post("/api/v1/auth/login", json={
            "email": teacher_email,
            "password": teacher_pass,
        })
        assert teacher_login.status_code == 200
        teacher_token = teacher_login.json()["access_token"]
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}

        dev_list_resp = client.get("/api/v1/devices", headers=teacher_headers)
        assert dev_list_resp.status_code == 200
        devices = dev_list_resp.json()
        matching = [d for d in devices if d["id"] == config.device_id]
        assert len(matching) == 1
        assert matching[0]["status"] == "connected"

        # Inspect events
        dev_events_resp = client.get(f"/api/v1/devices/{config.device_id}/events", headers=teacher_headers)
        assert dev_events_resp.status_code == 200
        ev_list = dev_events_resp.json()
        assert len(ev_list) >= 1
        assert ev_list[0]["details"]["process_name"] == "calculator.exe"

        # 8. Student revokes device
        revoke_resp = client.post(f"/api/v1/devices/{config.device_id}/revoke", headers=student_headers)
        assert revoke_resp.status_code == 200

        # Verify device is now revoked
        dev_check = client.get(f"/api/v1/devices/{config.device_id}", headers=teacher_headers)
        assert dev_check.json()["status"] == "revoked"

    finally:
        if os.path.exists(temp_cfg):
            os.remove(temp_cfg)
