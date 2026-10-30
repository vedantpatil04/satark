from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher, get_current_actor
from backend.app.core.security import (
    generate_pairing_code, verify_and_consume_pairing_code,
    create_device_token, decode_device_token, create_ws_ticket
)
from backend.app.models import User, Device, ActivityEvent
from backend.app.schemas import (
    DeviceRegisterRequest, DeviceResponse, DeviceHeartbeatRequest,
    DeviceStatusResponse, EventBatchRequest, EventIngestResponse,
    DevicePairingCodeResponse, DevicePairRequest, DevicePairResponse,
    DeviceWsTicketResponse
)
from backend.app.services.audit_service import log_action
from backend.app.services.event_service import ingest_event_envelope
from backend.app.websocket.manager import ws_manager

router = APIRouter(prefix="/devices", tags=["Devices & Hardware"])
bearer_scheme = HTTPBearer(auto_error=False)


# ==========================================
# 1. Device Pairing Endpoints
# ==========================================
@router.post("/pairing-code", response_model=DevicePairingCodeResponse)
def request_device_pairing_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authenticated student requests a single-use 6-character pairing code to connect their desktop agent.
    Valid for 10 minutes (600s).
    """
    code = generate_pairing_code(current_user.id, expires_seconds=600)
    return DevicePairingCodeResponse(pairing_code=code, expires_in_seconds=600)


@router.post("/pair", response_model=DevicePairResponse)
async def pair_desktop_agent(
    req: DevicePairRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Desktop agent submits pairing code and hardware details.
    Validates code, associates device with student, and returns a device-scoped token.
    """
    student_id = verify_and_consume_pairing_code(req.pairing_code)
    if not student_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired pairing code. Please generate a new code from Student Portal."
        )

    student = db.query(User).filter(User.id == student_id).first()
    if not student or not student.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student account associated with pairing code not found or inactive"
        )

    now = datetime.now(timezone.utc)
    device = db.query(Device).filter(Device.hardware_uuid == req.hardware_uuid).first()

    # Rule: Single active device per student policy - mark older devices as inactive
    prior_devices = db.query(Device).filter(
        Device.owner_user_id == student.id,
        Device.hardware_uuid != req.hardware_uuid
    ).all()
    for pd in prior_devices:
        pd.status = "inactive"
        db.add(pd)

    if device:
        device.hostname = req.hostname or device.hostname
        device.os_type = req.os_type
        device.os_version = req.os_version or device.os_version
        device.agent_version = req.agent_version
        device.owner_user_id = student.id
        device.last_heartbeat_at = now
        device.status = "connected"
    else:
        device = Device(
            hardware_uuid=req.hardware_uuid,
            hostname=req.hostname,
            os_type=req.os_type,
            os_version=req.os_version,
            agent_version=req.agent_version,
            owner_user_id=student.id,
            last_heartbeat_at=now,
            status="connected"
        )
        db.add(device)

    db.commit()
    db.refresh(device)

    # Issue device-scoped credential
    device_token = create_device_token(device.id, student.id)

    # Broadcast device status update to teachers
    await ws_manager.broadcast_device_status({
        "id": device.id,
        "hardware_uuid": device.hardware_uuid,
        "status": device.status,
        "last_heartbeat_at": device.last_heartbeat_at.isoformat()
    })

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="DEVICE_PAIRED",
        actor_user_id=student.id,
        target_resource=device.id,
        ip_address=client_ip,
        details={"hardware_uuid": device.hardware_uuid, "os_type": device.os_type}
    )

    return DevicePairResponse(
        device_id=device.id,
        device_token=device_token,
        student_id=student.id,
        student_name=student.full_name,
        hardware_uuid=device.hardware_uuid,
        status=device.status
    )


@router.post("/ws-ticket", response_model=DeviceWsTicketResponse)
def get_device_ws_ticket(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
):
    """
    Desktop agent exchanges its device_token for a single-use 60s ticket to connect to /ws/agent.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing device token"
        )

    payload = decode_device_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired device token"
        )

    device_id = payload.get("device_id") or payload.get("sub")
    ticket = create_ws_ticket(user_id=device_id, role="agent", channel="agent")
    return DeviceWsTicketResponse(ticket=ticket, expires_in_seconds=60)


@router.post("/{device_id}/revoke")
async def revoke_device(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Revokes device authorization. Can be executed by student owner or teacher.
    """
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if current_user.role != "teacher" and device.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    device.status = "revoked"
    device.owner_user_id = None
    db.commit()

    await ws_manager.broadcast_device_status({
        "id": device.id,
        "hardware_uuid": device.hardware_uuid,
        "status": "revoked",
        "last_heartbeat_at": device.last_heartbeat_at.isoformat() if device.last_heartbeat_at else None
    })

    log_action(
        db,
        action="DEVICE_REVOKED",
        actor_user_id=current_user.id,
        target_resource=device.id,
        details={"hardware_uuid": device.hardware_uuid}
    )

    return {"message": "Device revoked successfully", "device_id": device_id}


# ==========================================
# 2. Standard Device Management Endpoints
# ==========================================
@router.post("/register", response_model=DeviceResponse)
def register_device(
    req: DeviceRegisterRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    device = db.query(Device).filter(Device.hardware_uuid == req.hardware_uuid).first()

    if current_user.role == "student":
        prior_devices = db.query(Device).filter(
            Device.owner_user_id == current_user.id,
            Device.hardware_uuid != req.hardware_uuid
        ).all()
        for pd in prior_devices:
            pd.status = "inactive"
            db.add(pd)

    if device:
        device.hostname = req.hostname or device.hostname
        device.os_type = req.os_type
        device.os_version = req.os_version or device.os_version
        device.agent_version = req.agent_version
        device.owner_user_id = current_user.id
        device.last_heartbeat_at = now
        device.status = "connected"
    else:
        device = Device(
            hardware_uuid=req.hardware_uuid,
            hostname=req.hostname,
            os_type=req.os_type,
            os_version=req.os_version,
            agent_version=req.agent_version,
            owner_user_id=current_user.id,
            last_heartbeat_at=now,
            status="connected"
        )
        db.add(device)

    db.commit()
    db.refresh(device)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="DEVICE_REGISTERED",
        actor_user_id=current_user.id,
        target_resource=device.id,
        ip_address=client_ip,
        details={"hardware_uuid": device.hardware_uuid, "os_type": device.os_type}
    )

    return device


@router.get("", response_model=List[DeviceResponse])
def list_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    if current_user.role == "teacher":
        devices = db.query(Device).all()
    else:
        devices = db.query(Device).filter(Device.owner_user_id == current_user.id).all()

    for d in devices:
        if d.last_heartbeat_at:
            elapsed = (now - d.last_heartbeat_at.replace(tzinfo=timezone.utc)).total_seconds() if d.last_heartbeat_at.tzinfo else (now.replace(tzinfo=None) - d.last_heartbeat_at).total_seconds()
            if elapsed > 15 and d.status == "connected":
                d.status = "disconnected"
                db.add(d)

    db.commit()
    return devices


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if current_user.role != "teacher" and device.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return device


@router.post("/{device_id}/heartbeat", response_model=DeviceStatusResponse)
async def submit_heartbeat(
    device_id: str,
    req: DeviceHeartbeatRequest,
    actor: Dict[str, Any] = Depends(get_current_actor),
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    # If actor is agent, ensure device matches
    if actor["type"] == "agent" and actor["device_id"] != device_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent token mismatch")

    now = datetime.now(timezone.utc)
    device.last_heartbeat_at = now
    device.status = "connected"
    if req.agent_version:
        device.agent_version = req.agent_version
    db.commit()
    db.refresh(device)

    # Broadcast device status update to teachers
    await ws_manager.broadcast_device_status({
        "id": device.id,
        "hardware_uuid": device.hardware_uuid,
        "status": device.status,
        "last_heartbeat_at": device.last_heartbeat_at.isoformat()
    })

    return DeviceStatusResponse(
        id=device.id,
        status=device.status,
        last_heartbeat_at=device.last_heartbeat_at,
        is_connected=True
    )


@router.get("/{device_id}/events")
def get_device_events(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if current_user.role != "teacher" and device.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    events = db.query(ActivityEvent).filter(
        ActivityEvent.device_id == device_id
    ).order_by(ActivityEvent.occurred_at.desc()).limit(100).all()
    return events


@router.post("/events", response_model=EventIngestResponse)
async def ingest_events(
    req: EventBatchRequest,
    actor: Dict[str, Any] = Depends(get_current_actor),
    db: Session = Depends(get_db)
):
    persisted = 0
    duplicates = 0
    alerts_triggered = 0

    for envelope in req.events:
        event, is_new, alert = ingest_event_envelope(db, envelope, raise_on_duplicate=False)
        if is_new:
            persisted += 1
            if alert:
                alerts_triggered += 1
                await ws_manager.broadcast_alert({
                    "id": alert.id,
                    "session_id": alert.session_id,
                    "student_id": alert.student_id,
                    "device_id": alert.device_id,
                    "alert_type": alert.alert_type,
                    "severity": alert.severity,
                    "description": alert.description
                })
        else:
            duplicates += 1

    return EventIngestResponse(
        received=len(req.events),
        persisted=persisted,
        duplicates_skipped=duplicates,
        alerts_triggered=alerts_triggered
    )
