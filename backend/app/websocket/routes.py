import json
import re
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from backend.app.core.config import settings
from backend.app.core.security import verify_and_consume_ws_ticket
from backend.app.websocket.manager import ws_manager
from backend.app.core.database import SessionLocal
from backend.app.models import Device, AuditLog
from backend.app.schemas import EventEnvelope
from backend.app.services.event_service import ingest_event_envelope

router = APIRouter(tags=["WebSockets"])

LAN_ORIGIN_PATTERN = re.compile(
    r"^https?://(([a-zA-Z0-9-]+\.)*(satark\.test|satark\.local)|localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    re.IGNORECASE
)


def is_valid_websocket_origin(origin: str | None) -> bool:
    if not origin:
        return True  # Native mobile agents & desktop monitor
    clean_origin = origin.rstrip("/")
    if clean_origin in settings.CORS_ORIGINS:
        return True
    if LAN_ORIGIN_PATTERN.match(clean_origin):
        return True
    return False


@router.websocket("/ws/teacher")
async def websocket_teacher_endpoint(
    websocket: WebSocket,
    ticket: str = Query(...)
):
    # 1. Validate explicit WebSocket origin
    origin = websocket.headers.get("origin")
    if not is_valid_websocket_origin(origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not allowed")
        return

    # 2. Verify short-lived, single-use ticket
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
                elif msg_type in (
                    "screen_share_request",
                    "screen_share_accepted",
                    "screen_share_rejected",
                    "screen_share_stopped",
                    "webrtc_offer",
                    "webrtc_answer",
                    "ice_candidate",
                    "unlock_student"
                ):
                    # WebRTC Signaling & Proctor Controls from Teacher to Student
                    target_student = data.get("student_id") or data.get("target_user_id")
                    data["teacher_id"] = user_id
                    if msg_type == "unlock_student":
                        if target_student:
                            await ws_manager.send_to_student(target_student, {
                                "type": "exam_unlocked",
                                "exam_id": data.get("exam_id"),
                                "teacher_id": user_id,
                                "message": "Instructor has granted permission to resume your assessment."
                            })
                            await ws_manager.broadcast_to_teachers({
                                "type": "student_unlocked_confirmed",
                                "exam_id": data.get("exam_id"),
                                "student_id": target_student,
                                "teacher_id": user_id
                            })
                            db = SessionLocal()
                            try:
                                db.add(AuditLog(
                                    actor_user_id=user_id,
                                    action="TEACHER_GRANTED_EXAM_UNLOCK",
                                    target_resource=target_student,
                                    details={"by": "teacher", "exam_id": data.get("exam_id")}
                                ))
                                db.commit()
                            finally:
                                db.close()
                    elif target_student:
                        await ws_manager.send_to_student(target_student, data)
                        if msg_type in ("screen_share_request", "screen_share_stopped"):
                            db = SessionLocal()
                            try:
                                db.add(AuditLog(
                                    actor_user_id=user_id,
                                    action=f"SCREEN_SHARE_{msg_type.replace('screen_share_', '').upper()}",
                                    target_resource=target_student,
                                    details={"by": "teacher", "exam_id": data.get("exam_id")}
                                ))
                                db.commit()
                            finally:
                                db.close()
                    elif msg_type == "screen_share_request":
                        # Broadcast request to all students participating in exam
                        await ws_manager.broadcast_to_students(data)
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect_teacher(websocket, user_id)


@router.websocket("/ws/student")
async def websocket_student_endpoint(
    websocket: WebSocket,
    ticket: str = Query(...)
):
    # 1. Validate explicit WebSocket origin
    origin = websocket.headers.get("origin")
    if not is_valid_websocket_origin(origin):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Origin not allowed")
        return

    # 2. Verify short-lived, single-use ticket
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
                elif data.get("type") in (
                    "screen_share_accepted",
                    "screen_share_rejected",
                    "screen_share_stopped",
                    "webrtc_offer",
                    "webrtc_answer",
                    "ice_candidate",
                    "tab_switch_alert",
                    "student_locked",
                    "request_exam_unlock"
                ):
                    # WebRTC Signaling & Integrity Violations from Student to Teacher
                    msg_type = data.get("type")
                    target_teacher = data.get("teacher_id") or data.get("target_user_id")
                    data["student_id"] = user_id
                    if target_teacher:
                        await ws_manager.send_to_teacher(target_teacher, data)
                    else:
                        await ws_manager.broadcast_to_teachers(data)

                    if msg_type in ("screen_share_accepted", "screen_share_rejected", "screen_share_stopped"):
                        db = SessionLocal()
                        try:
                            db.add(AuditLog(
                                actor_user_id=user_id,
                                action=f"SCREEN_SHARE_{msg_type.replace('screen_share_', '').upper()}",
                                target_resource=target_teacher or "all_teachers",
                                details={"by": "student", "exam_id": data.get("exam_id")}
                            ))
                            db.commit()
                        finally:
                            db.close()
                    elif msg_type in ("student_locked", "request_exam_unlock"):
                        db = SessionLocal()
                        try:
                            db.add(AuditLog(
                                actor_user_id=user_id,
                                action=msg_type.upper(),
                                target_resource=data.get("exam_id") or "exam",
                                details={
                                    "by": "student",
                                    "tab_switch_number": data.get("tab_switch_number"),
                                    "reason": data.get("reason")
                                }
                            ))
                            db.commit()
                        finally:
                            db.close()
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

