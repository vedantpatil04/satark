import time
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
import jwt
import bcrypt
from backend.app.core.config import settings

# In-memory single-use WebSocket ticket storage: { ticket: { user_id, role, channel, expires_at } }
_ws_ticket_store: Dict[str, Dict[str, Any]] = {}
_pairing_code_store: Dict[str, Dict[str, Any]] = {}


def generate_pairing_code(student_id: str, expires_seconds: int = 600) -> str:
    """
    Generate a 6-character uppercase alphanumeric single-use pairing code (expires in 10 mins).
    """
    _cleanup_pairing_codes()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(alphabet) for _ in range(6))
    _pairing_code_store[code] = {
        "student_id": student_id,
        "expires_at": time.time() + expires_seconds
    }
    return code


def verify_and_consume_pairing_code(code: str) -> Optional[str]:
    """
    Validates and consumes a device pairing code. Returns student_id if valid, else None.
    """
    _cleanup_pairing_codes()
    cleaned = code.strip().upper()
    data = _pairing_code_store.pop(cleaned, None)
    if not data:
        return None
    if time.time() > data["expires_at"]:
        return None
    return data["student_id"]


def _cleanup_pairing_codes():
    now = time.time()
    expired = [k for k, v in _pairing_code_store.items() if v["expires_at"] < now]
    for k in expired:
        _pairing_code_store.pop(k, None)


def create_device_token(device_id: str, student_id: str) -> str:
    """
    Issues a scoped JWT token for a paired desktop agent (valid for 30 days).
    """
    return create_access_token(
        subject=device_id,
        role="agent",
        extra_data={
            "device_id": device_id,
            "student_id": student_id
        },
        expires_delta=timedelta(days=30)
    )


def decode_device_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Decodes and validates a device agent token.
    """
    payload = decode_access_token(token)
    if payload and payload.get("role") == "agent":
        return payload
    return None


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, role: str, extra_data: Optional[Dict[str, Any]] = None, expires_delta: Optional[timedelta] = None) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": expire
    }
    if extra_data:
        to_encode.update(extra_data)
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def create_ws_ticket(user_id: str, role: str, channel: str = "general") -> str:
    """
    Generate a short-lived (60s), single-use ticket for WebSocket authentication.
    """
    _cleanup_expired_tickets()
    ticket = f"tkt_{secrets.token_urlsafe(32)}"
    expires_at = time.time() + settings.WS_TICKET_EXPIRE_SECONDS
    _ws_ticket_store[ticket] = {
        "user_id": user_id,
        "role": role,
        "channel": channel,
        "expires_at": expires_at
    }
    return ticket


def verify_and_consume_ws_ticket(ticket: str, expected_channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Validates and immediately consumes a WebSocket ticket (single-use).
    """
    _cleanup_expired_tickets()
    ticket_data = _ws_ticket_store.pop(ticket, None)
    if not ticket_data:
        return None
    
    if time.time() > ticket_data["expires_at"]:
        return None
        
    if expected_channel and ticket_data.get("channel") != "general" and ticket_data.get("channel") != expected_channel:
        return None
        
    return ticket_data


def _cleanup_expired_tickets():
    now = time.time()
    expired_keys = [k for k, v in _ws_ticket_store.items() if v["expires_at"] < now]
    for k in expired_keys:
        _ws_ticket_store.pop(k, None)

