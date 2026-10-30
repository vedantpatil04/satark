import json
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import jwt
from backend.app.core.config import settings


def is_livekit_configured() -> bool:
    """Returns True if LiveKit URL, API Key, and Secret are populated."""
    return bool(settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET)


def generate_livekit_token(
    user_id: str,
    user_name: str,
    role: str,
    room_name: str,
    exam_id: str,
    can_publish: Optional[bool] = None,
    can_subscribe: Optional[bool] = None,
    expires_minutes: int = 120
) -> Dict[str, Any]:
    """
    Generates an RFC-compliant, short-lived LiveKit Access Token.
    - Teachers: can_subscribe=True, can_publish=False (or True if broadcasting).
    - Students: can_subscribe=False (cannot peek at other students), can_publish=True (screen-sharing only).
    """
    if can_publish is None:
        can_publish = (role == "student")
    if can_subscribe is None:
        can_subscribe = (role == "teacher")

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=expires_minutes)

    user_id_str = str(user_id)
    exam_id_str = str(exam_id)

    payload = {
        "iss": settings.LIVEKIT_API_KEY or "satark-dev-key",
        "sub": user_id_str,
        "name": user_name,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": can_subscribe,
            "canPublishData": True,
            "canPublishSources": ["screen_share"] if role == "student" else ["camera", "screen_share"],
            "hidden": False,
            "recorder": False
        },
        "metadata": json.dumps({
            "role": role,
            "exam_id": exam_id_str,
            "user_id": user_id_str,
            "name": user_name
        }, default=str)
    }

    secret = settings.LIVEKIT_API_SECRET or "satark-dev-secret-key-change-in-production"
    token = jwt.encode(payload, secret, algorithm="HS256")

    return {
        "token": token,
        "url": settings.LIVEKIT_URL or "",
        "room_name": room_name,
        "identity": user_id_str,
        "participant_name": user_name,
        "role": role,
        "can_publish": can_publish,
        "can_subscribe": can_subscribe,
        "expires_in": expires_minutes * 60,
        "is_configured": is_livekit_configured()
    }

