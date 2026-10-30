from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ==========================================
# Auth Schemas
# ==========================================
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)
    role: Optional[Literal["teacher", "student"]] = "student"
    teacher_provisioning_key: Optional[str] = None


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class WsTicketRequest(BaseModel):
    channel: Optional[str] = "general"


class WsTicketResponse(BaseModel):
    ticket: str
    expires_in: int = 60


# ==========================================
# Classroom Schemas
# ==========================================
class ClassroomCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    subject_code: Optional[str] = None
    description: Optional[str] = None


class ClassroomResponse(BaseModel):
    id: str
    teacher_id: str
    title: str
    subject_code: Optional[str] = None
    description: Optional[str] = None
    join_code: str
    is_archived: bool
    created_at: datetime
    enrolled_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class ClassroomJoinRequest(BaseModel):
    join_code: str = Field(..., min_length=4, max_length=10)


class EnrolledStudentResponse(BaseModel):
    student_id: str
    full_name: str
    email: str
    enrolled_at: datetime


# ==========================================
# Device Schemas
# ==========================================
class DeviceRegisterRequest(BaseModel):
    hardware_uuid: str = Field(..., min_length=8)
    hostname: Optional[str] = None
    os_type: Literal["windows", "linux", "macos"] = "windows"
    os_version: Optional[str] = None
    agent_version: str = "1.0.0"


class DeviceHeartbeatRequest(BaseModel):
    agent_version: Optional[str] = "1.0.0"
    cpu_usage_percent: Optional[float] = None
    memory_usage_mb: Optional[float] = None
    battery_state: Optional[str] = None


class DeviceResponse(BaseModel):
    id: str
    hardware_uuid: str
    hostname: Optional[str] = None
    os_type: str
    os_version: Optional[str] = None
    agent_version: str
    owner_user_id: Optional[str] = None
    last_heartbeat_at: Optional[datetime] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeviceStatusResponse(BaseModel):
    id: str
    status: str
    last_heartbeat_at: Optional[datetime] = None
    is_connected: bool


# ==========================================
# Device Pairing Schemas
# ==========================================
class DevicePairingCodeResponse(BaseModel):
    pairing_code: str
    expires_in_seconds: int


class DevicePairRequest(BaseModel):
    pairing_code: str
    hardware_uuid: str
    hostname: Optional[str] = None
    os_type: str
    os_version: Optional[str] = None
    agent_version: str = "1.0.0"


class DevicePairResponse(BaseModel):
    device_id: str
    device_token: str
    student_id: str
    student_name: str
    hardware_uuid: str
    status: str


class DeviceWsTicketResponse(BaseModel):
    ticket: str
    expires_in_seconds: int


# ==========================================
# Exam Schemas
# ==========================================
class ExamCreate(BaseModel):
    classroom_id: str
    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = None
    exam_code: Optional[str] = None
    duration_minutes: int = Field(60, ge=5, le=480)
    scheduled_start: Optional[datetime] = None
    policy_config: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ExamResponse(BaseModel):
    id: str
    classroom_id: str
    teacher_id: str
    title: str
    description: Optional[str] = None
    exam_code: str
    duration_minutes: int
    scheduled_start: datetime
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: str
    policy_config: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamJoinRequest(BaseModel):
    exam_code: str
    device_id: Optional[str] = None


class ExamActionResponse(BaseModel):
    id: str
    status: str
    message: str


class ExamGrantTimeRequest(BaseModel):
    additional_minutes: int = Field(..., ge=1, le=180)


class ExamGrantTimeResponse(BaseModel):
    exam_id: str
    duration_minutes: int
    additional_minutes: int
    message: str


class ClassroomAnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    message: str = Field(..., min_length=2)


class ClassroomAnnouncementResponse(BaseModel):
    classroom_id: str
    title: str
    message: str
    recipients_count: int
    created_at: datetime


# ==========================================
# Exam Question & Submission Schemas
# ==========================================
class ExamQuestionCreate(BaseModel):
    question_text: str = Field(..., min_length=3)
    options: List[str] = Field(..., min_length=2, max_length=6)
    correct_option_index: int = Field(..., ge=0, le=5)
    marks: int = Field(1, ge=1, le=100)
    order_num: Optional[int] = 1


class ExamQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_option_index: Optional[int] = None
    marks: Optional[int] = None
    order_num: Optional[int] = None


class ExamQuestionResponse(BaseModel):
    id: str
    exam_id: str
    question_text: str
    options: List[str]
    marks: int
    order_num: int
    # Omitted or None for students until exam concludes
    correct_option_index: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option_index: Optional[int] = None


class StudentAnswerResponse(BaseModel):
    id: str
    exam_id: str
    question_id: str
    selected_option_index: Optional[int] = None
    answered_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamSubmitRequest(BaseModel):
    answers: Optional[List[SaveAnswerRequest]] = Field(default_factory=list)


class ExamSubmissionResponse(BaseModel):
    id: str
    exam_id: str
    student_id: str
    student_name: Optional[str] = None
    score: Optional[int] = None
    total_marks: Optional[int] = None
    percentage: Optional[int] = None
    status: str
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Focus Schemas
# ==========================================
class FocusSessionCreate(BaseModel):
    goal_title: str = Field(..., min_length=2, max_length=200)
    planned_duration_minutes: int = Field(25, ge=1, le=240)
    classroom_id: Optional[str] = None


class FocusSessionResponse(BaseModel):
    id: str
    student_id: str
    classroom_id: Optional[str] = None
    goal_title: str
    planned_duration_minutes: int
    actual_focus_seconds: int
    actual_break_seconds: int
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FocusSessionActionRequest(BaseModel):
    additional_focus_seconds: Optional[int] = 0
    additional_break_seconds: Optional[int] = 0
    notes: Optional[str] = None


class FocusDailyTrend(BaseModel):
    date: str
    focus_minutes: int
    break_minutes: int


class FocusAnalyticsResponse(BaseModel):
    daily_focus_seconds: int
    weekly_focus_seconds: int
    total_completed_sessions: int
    total_abandoned_sessions: int
    total_break_seconds: int
    completion_rate_percentage: float
    daily_trends: List[FocusDailyTrend]


# ==========================================
# Unified Event Envelope Schemas
# ==========================================
class EventEnvelope(BaseModel):
    event_id: str = Field(..., description="Unique UUIDv4 for duplicate detection")
    type: Literal["activity_event", "heartbeat", "connectivity_event", "session_event", "alert_event"]
    event_type: str = Field(..., description="Granular event type: restricted_website, window_blur, tab_switch, etc.")
    device_id: Optional[str] = None
    student_id: str
    classroom_id: Optional[str] = None
    session_id: str
    mode: Literal["exam", "focus"]
    occurred_at: datetime
    source: Literal["agent", "server", "demo", "web_client"] = "agent"
    severity: Literal["low", "medium", "high", "critical"] = "low"
    details: Dict[str, Any] = Field(default_factory=dict)


class EventBatchRequest(BaseModel):
    events: List[EventEnvelope]


class EventIngestResponse(BaseModel):
    received: int
    persisted: int
    duplicates_skipped: int
    alerts_triggered: int


# ==========================================
# Alert & Notification Schemas
# ==========================================
class AlertResponse(BaseModel):
    id: str
    session_id: str
    student_id: str
    device_id: Optional[str] = None
    primary_event_id: Optional[str] = None
    alert_type: str
    severity: str
    description: str
    evidence_summary: Optional[Dict[str, Any]] = None
    is_acknowledged: bool
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    proctor_notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertAcknowledgeRequest(BaseModel):
    proctor_notes: Optional[str] = None


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Audit Schemas
# ==========================================
class AuditLogResponse(BaseModel):
    id: str
    actor_user_id: Optional[str] = None
    action: str
    target_resource: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
