import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from backend.app.core.security import verify_and_consume_ws_ticket
from backend.app.websocket.manager import ws_manager
from backend.app.core.database import SessionLocal
from backend.app.models import Device
from backend.app.schemas import EventEnvelope
from backend.app.services.event_service import ingest_event_envelope

router = APIRouter(tags=["WebSockets"])


@router.websocket("/ws/teacher")
async def websocket_teacher_endpoint(
    websocket: WebSocket,
    ticket: str = Query(...)
):
    # Verify short-lived, single-use ticket
    ticket_data = verify_and_consume_ws_ticket(ticket, expected_channel="teacher")
    if not ticket_data or ticket_data.get("role") != "teacher":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = ticket_data["user_id"]
    await ws_manager.connect_teacher(websocket, user_id)
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                msg_type = data.get("type")
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "time": datetime.now(timezone.utc).isoformat()}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect_teacher(websocket, user_id)


@router.websocket("/ws/student")
async def websocket_student_endpoint(
    websocket: WebSocket,
    ticket: str = Query(...)
):
    ticket_data = verify_and_consume_ws_ticket(ticket, expected_channel="student")
    if not ticket_data or ticket_data.get("role") != "student":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = ticket_data["user_id"]
    await ws_manager.connect_student(websocket, user_id)
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                data = json.loads(raw_text)
                if data.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong", "time": datetime.now(timezone.utc).isoformat()}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect_student(websocket, user_id)


@router.websocket("/ws/agent")
async def websocket_agent_endpoint(
    websocket: WebSocket,
    ticket: str = Query(...)
):
    ticket_data = verify_and_consume_ws_ticket(ticket, expected_channel="agent")
    if not ticket_data:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    device_id = ticket_data.get("user_id")  # In agent tickets, user_id carries device_id
    await ws_manager.connect_agent(websocket, device_id)
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                msg = json.loads(raw_text)
                msg_type = msg.get("type")
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                elif msg_type == "heartbeat":
                    db = SessionLocal()
                    try:
                        device = db.query(Device).filter(Device.id == device_id).first()
                        if device:
                            device.last_heartbeat_at = datetime.now(timezone.utc)
                            device.status = "connected"
                            db.commit()
                            device_data = {
                                "id": device.id,
                                "hardware_uuid": device.hardware_uuid,
                                "status": device.status,
                                "last_heartbeat_at": device.last_heartbeat_at.isoformat()
                            }
                            if "health" in msg and msg["health"]:
                                device_data["health"] = msg["health"]
                            await ws_manager.broadcast_device_status(device_data)
                        await websocket.send_text(json.dumps({
                            "type": "heartbeat_ack",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }))
                    finally:
                        db.close()
                elif msg_type == "event_envelope":
                    # Ingest real-time event envelope
                    envelope_data = msg.get("envelope")
                    if envelope_data:
                        db = SessionLocal()
                        try:
                            envelope = EventEnvelope(**envelope_data)
                            event, is_new, alert = ingest_event_envelope(db, envelope, raise_on_duplicate=False)
                            if alert:
                                await ws_manager.broadcast_alert({
                                    "id": alert.id,
                                    "alert_type": alert.alert_type,
                                    "severity": alert.severity,
                                    "description": alert.description,
                                    "session_id": alert.session_id,
                                    "student_id": alert.student_id,
                                    "device_id": alert.device_id
                                })
                            await websocket.send_text(json.dumps({"type": "ack", "event_id": envelope.event_id}))
                        finally:
                            db.close()
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect_agent(websocket, device_id)

