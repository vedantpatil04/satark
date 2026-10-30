import json
import logging
from typing import Dict, Set, List, Any
from fastapi import WebSocket

logger = logging.getLogger("websocket")


class ConnectionManager:
    def __init__(self):
        # Teacher connections: user_id -> List[WebSocket]
        self.teacher_connections: Dict[str, List[WebSocket]] = {}
        # Student connections: user_id -> List[WebSocket]
        self.student_connections: Dict[str, List[WebSocket]] = {}
        # Desktop Agent connections: device_id -> List[WebSocket]
        self.agent_connections: Dict[str, List[WebSocket]] = {}
        # Active Exam rooms: exam_id -> Set[WebSocket]
        self.exam_rooms: Dict[str, Set[WebSocket]] = {}

    async def connect_teacher(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.teacher_connections:
            self.teacher_connections[user_id] = []
        self.teacher_connections[user_id].append(websocket)
        logger.info(f"Teacher {user_id} connected to WebSocket.")

    def disconnect_teacher(self, websocket: WebSocket, user_id: str):
        if user_id in self.teacher_connections:
            if websocket in self.teacher_connections[user_id]:
                self.teacher_connections[user_id].remove(websocket)
            if not self.teacher_connections[user_id]:
                del self.teacher_connections[user_id]
        logger.info(f"Teacher {user_id} disconnected.")

    async def connect_student(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.student_connections:
            self.student_connections[user_id] = []
        self.student_connections[user_id].append(websocket)
        logger.info(f"Student {user_id} connected to WebSocket.")

    def disconnect_student(self, websocket: WebSocket, user_id: str):
        if user_id in self.student_connections:
            if websocket in self.student_connections[user_id]:
                self.student_connections[user_id].remove(websocket)
            if not self.student_connections[user_id]:
                del self.student_connections[user_id]
        logger.info(f"Student {user_id} disconnected.")

    async def connect_agent(self, websocket: WebSocket, device_id: str):
        await websocket.accept()
        if device_id not in self.agent_connections:
            self.agent_connections[device_id] = []
        self.agent_connections[device_id].append(websocket)
        logger.info(f"Desktop Agent {device_id} connected.")

    def disconnect_agent(self, websocket: WebSocket, device_id: str):
        if device_id in self.agent_connections:
            if websocket in self.agent_connections[device_id]:
                self.agent_connections[device_id].remove(websocket)
            if not self.agent_connections[device_id]:
                del self.agent_connections[device_id]
        logger.info(f"Desktop Agent {device_id} disconnected.")

    async def broadcast_to_teachers(self, message: Dict[str, Any]):
        """Broadcasts payload to all connected teachers."""
        payload = json.dumps(message)
        for user_id, sockets in list(self.teacher_connections.items()):
            for ws in sockets:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def broadcast_to_students(self, message: Dict[str, Any]):
        """Broadcasts payload to all connected students."""
        payload = json.dumps(message)
        for user_id, sockets in list(self.student_connections.items()):
            for ws in sockets:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def send_to_student(self, student_id: str, message: Dict[str, Any]):
        """Sends payload to a specific student."""
        payload = json.dumps(message)
        if student_id in self.student_connections:
            for ws in self.student_connections[student_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def send_to_teacher(self, teacher_id: str, message: Dict[str, Any]):
        """Sends payload to a specific teacher."""
        payload = json.dumps(message)
        if teacher_id in self.teacher_connections:
            for ws in self.teacher_connections[teacher_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def send_to_agent(self, device_id: str, message: Dict[str, Any]):
        """Sends payload to a specific desktop agent."""
        payload = json.dumps(message)
        if device_id in self.agent_connections:
            for ws in self.agent_connections[device_id]:
                try:
                    await ws.send_text(payload)
                except Exception:
                    pass

    async def broadcast_alert(self, alert_data: Dict[str, Any]):
        """Broadcasts a new integrity alert to teachers."""
        await self.broadcast_to_teachers({
            "type": "integrity_alert",
            "alert": alert_data
        })

    async def broadcast_device_status(self, device_data: Dict[str, Any]):
        """Broadcasts device state transition to teachers."""
        await self.broadcast_to_teachers({
            "type": "device_status_update",
            "device": device_data
        })


ws_manager = ConnectionManager()

