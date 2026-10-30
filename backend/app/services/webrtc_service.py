from typing import Dict, Any, Optional
from backend.app.core.config import settings


def is_webrtc_available() -> bool:
    """Native WebRTC operates peer-to-peer over LAN via WebSocket signaling."""
    return True


def generate_webrtc_session_config(
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
    Generates Native WebRTC session authorization configuration.
    Uses WebSocket signaling server for SDP offer/answer and ICE candidate exchange.
    Teacher acts as hub receiving up to 5 student screen streams.
    """
    if can_publish is None:
        can_publish = (role == "student")
    if can_subscribe is None:
        can_subscribe = (role == "teacher")

    ice_servers = [{"urls": settings.WEBRTC_STUN_URLS}] if settings.WEBRTC_STUN_URLS else []

    return {
        "token": f"rtc_session_{user_id}_{exam_id}",
        "url": "",
        "room_name": room_name,
        "identity": str(user_id),
        "participant_name": user_name,
        "role": role,
        "can_publish": can_publish,
        "can_subscribe": can_subscribe,
        "webrtc_mode": "native_p2p_star",
        "ice_servers": ice_servers,
        "is_configured": True
    }

