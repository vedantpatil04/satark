from datetime import datetime
from typing import Annotated, Optional, List, Dict, Any, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict, BeforeValidator

ID = Annotated[str, BeforeValidator(lambda v: str(v) if v is not None else None)]
OptID = Annotated[Optional[str], BeforeValidator(lambda v: str(v) if v is not None else None)]


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
    id: ID
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
    id: ID
    teacher_id: ID
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
    student_id: ID
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
    id: ID
    hardware_uuid: str
    hostname: Optional[str] = None
    os_type: str
    os_version: Optional[str] = None
    agent_version: str
    owner_user_id: OptID = None
    last_heartbeat_at: Optional[datetime] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DeviceStatusResponse(BaseModel):
    id: ID
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
    device_id: ID
    device_token: str
    student_id: ID
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
    id: ID
    classroom_id: ID
    teacher_id: ID
    title: str
    description: Optional[str] = None
    exam_code: str
    duration_minutes: int
    scheduled_start: datetime
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: str
    policy_config: Dict[str, Any]
    is_results_published: bool = False
    passing_percentage: Optional[int] = 40
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamJoinRequest(BaseModel):
    exam_code: str
    device_id: Optional[str] = None


class ExamActionResponse(BaseModel):
    id: ID
    status: str
    message: str


class ExamGrantTimeRequest(BaseModel):
    additional_minutes: int = Field(..., ge=1, le=180)


class ExamGrantTimeResponse(BaseModel):
    exam_id: ID
    duration_minutes: int
    additional_minutes: int
    message: str


class ClassroomAnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    message: str = Field(..., min_length=2)


class ClassroomAnnouncementResponse(BaseModel):
    classroom_id: ID
    title: str
    message: str
    recipients_count: int
    created_at: datetime


# ==========================================
# Exam Question & Submission Schemas
# ==========================================
QuestionType = Literal["mcq", "multiple_select", "true_false", "short_answer"]


class ExamQuestionCreate(BaseModel):
    question_text: str = Field(..., min_length=2)
    question_type: QuestionType = "mcq"
    options: List[str] = Field(default_factory=list)
    correct_option_index: Optional[int] = None
    correct_answers: Optional[List[Any]] = Field(default_factory=list)
    marks: int = Field(1, ge=1, le=100)
    order_num: Optional[int] = 1
    explanation: Optional[str] = None


class ExamQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    question_type: Optional[QuestionType] = None
    options: Optional[List[str]] = None
    correct_option_index: Optional[int] = None
    correct_answers: Optional[List[Any]] = None
    marks: Optional[int] = None
    order_num: Optional[int] = None
    explanation: Optional[str] = None


class ExamQuestionResponse(BaseModel):
    id: ID
    exam_id: ID
    question_text: str
    question_type: str = "mcq"
    options: List[str] = Field(default_factory=list)
    marks: int
    order_num: int
    explanation: Optional[str] = None
    # Omitted or None for students until exam concludes
    correct_option_index: Optional[int] = None
    correct_answers: Optional[List[Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option_index: Optional[int] = None
    selected_options: Optional[List[int]] = None
    text_answer: Optional[str] = None


class StudentAnswerResponse(BaseModel):
    id: ID
    exam_id: ID
    question_id: ID
    selected_option_index: Optional[int] = None
    selected_options: Optional[List[int]] = None
    text_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    marks_awarded: Optional[int] = 0
    answered_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExamSubmitRequest(BaseModel):
    answers: Optional[List[SaveAnswerRequest]] = Field(default_factory=list)


class ExamSubmissionResponse(BaseModel):
    id: ID
    exam_id: ID
    student_id: ID
    student_name: Optional[str] = None
    score: Optional[int] = None
    total_marks: Optional[int] = None
    percentage: Optional[float] = None
    status: str
    is_passed: Optional[bool] = None
    submitted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubmissionQuestionReview(BaseModel):
    question_id: str
    question_text: str
    question_type: str
    options: List[str]
    marks: int
    order_num: int
    correct_option_index: Optional[int] = None
    correct_answers: Optional[List[Any]] = None
    explanation: Optional[str] = None
    selected_option_index: Optional[int] = None
    selected_options: Optional[List[int]] = None
    text_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    marks_awarded: int = 0
    manual_score: Optional[int] = None
    feedback: Optional[str] = None


class SubmissionReviewResponse(BaseModel):
    submission_id: str
    exam_id: str
    student_id: str
    student_name: str
    score: int
    total_marks: int
    percentage: float
    status: str
    is_passed: Optional[bool] = None
    passing_percentage: Optional[int] = 40
    is_results_published: bool = False
    submitted_at: datetime
    questions: List[SubmissionQuestionReview]


class GradeAnswerRequest(BaseModel):
    manual_score: int
    feedback: Optional[str] = None


class PublishResultsRequest(BaseModel):
    passing_percentage: Optional[int] = 40


# ==========================================
# Focus Schemas
# ==========================================
class FocusSessionCreate(BaseModel):
    goal_title: str = Field(..., min_length=2, max_length=200)
    planned_duration_minutes: int = Field(25, ge=1, le=240)
    classroom_id: Optional[str] = None


class FocusSessionResponse(BaseModel):
    id: ID
    student_id: ID
    classroom_id: OptID = None
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
    id: ID
    session_id: ID
    student_id: ID
    device_id: OptID = None
    primary_event_id: OptID = None
    alert_type: str
    severity: str
    description: str
    evidence_summary: Optional[Dict[str, Any]] = None
    is_acknowledged: bool
    acknowledged_by: OptID = None
    acknowledged_at: Optional[datetime] = None
    proctor_notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertAcknowledgeRequest(BaseModel):
    proctor_notes: Optional[str] = None


class NotificationResponse(BaseModel):
    id: ID
    user_id: ID
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
    id: ID
    actor_user_id: OptID = None
    action: str
    target_resource: OptID = None
    ip_address: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Question Bank & Dataset Schemas
# ==========================================
class QuestionBankItemCreate(BaseModel):
    external_id: Optional[str] = None
    question_type: Literal["mcq"] = "mcq"
    question_text: str = Field(..., min_length=3)
    options: List[str] = Field(..., min_length=2)
    correct_option_index: int = Field(..., ge=0)
    marks: int = Field(default=1, ge=1)
    negative_marks: int = Field(default=0, ge=0)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    topic: Optional[str] = None
    explanation: Optional[str] = None


class QuestionBankItemUpdate(BaseModel):
    external_id: Optional[str] = None
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_option_index: Optional[int] = None
    marks: Optional[int] = None
    negative_marks: Optional[int] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    topic: Optional[str] = None
    explanation: Optional[str] = None


class QuestionBankItemResponse(BaseModel):
    id: ID
    bank_id: ID
    external_id: Optional[str] = None
    question_type: str = "mcq"
    question_text: str
    options: List[str]
    correct_option_index: int
    marks: int
    negative_marks: int
    difficulty: str
    topic: Optional[str] = None
    explanation: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionBankCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    subject: str = Field(..., min_length=2, max_length=100)
    topic: Optional[str] = None
    description: Optional[str] = None


class QuestionBankUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    description: Optional[str] = None


class QuestionBankResponse(BaseModel):
    id: ID
    teacher_id: ID
    title: str
    subject: str
    topic: Optional[str] = None
    description: Optional[str] = None
    item_count: Optional[int] = 0
    total_marks: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionBankDetailResponse(QuestionBankResponse):
    items: List[QuestionBankItemResponse] = Field(default_factory=list)


# Canonical JSON format models
class QuestionDatasetItem(BaseModel):
    externalId: str = Field(..., min_length=1)
    type: Literal["mcq"] = "mcq"
    question: str = Field(..., min_length=2)
    options: List[str] = Field(..., min_length=2)
    correctOptionIndex: int = Field(..., ge=0)
    marks: int = Field(default=1, ge=1)
    negativeMarks: int = Field(default=0, ge=0)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    topic: Optional[str] = None
    explanation: Optional[str] = None


class QuestionBankDataset(BaseModel):
    schemaVersion: str = "1.0"
    title: str = Field(..., min_length=2)
    subject: str = Field(..., min_length=2)
    topic: Optional[str] = None
    description: Optional[str] = None
    questions: List[QuestionDatasetItem] = Field(..., min_length=1)


class QuestionValidationSummary(BaseModel):
    valid: bool
    schema_version: str
    total_questions: int
    valid_count: int
    invalid_count: int
    valid_questions: List[Dict[str, Any]]
    errors: List[Dict[str, Any]]


class ImportDatasetRequest(BaseModel):
    bank_id: Optional[str] = None
    title: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    description: Optional[str] = None
    dataset: QuestionBankDataset


# ==========================================
# Exam Snapshot & Bank Selection Schemas
# ==========================================
class ExamImportQuestionsFromBankRequest(BaseModel):
    item_ids: List[str] = Field(..., min_length=1)


class ExamQuestionSnapshotResponse(BaseModel):
    id: ID
    exam_id: ID
    total_questions: int
    total_marks: int
    snapshot_data: List[Dict[str, Any]]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# LiveKit & WebRTC Media Monitoring Schemas
# ==========================================
class LiveKitTokenRequest(BaseModel):
    can_publish: Optional[bool] = None
    is_camera: Optional[bool] = False


class LiveKitTokenResponse(BaseModel):
    token: str
    url: str
    room_name: str
    identity: str
    participant_name: str
    role: str
    can_publish: bool
    can_subscribe: bool
    expires_in: int = 7200
    webrtc_mode: Optional[str] = "native_p2p_star"
    ice_servers: Optional[List[Dict[str, Any]]] = None


class MediaShareActionRequest(BaseModel):
    student_id: Optional[str] = None
    action: Literal["request", "approve", "reject", "start", "stop"]


class MediaShareStatusResponse(BaseModel):
    id: ID
    exam_id: ID
    student_id: ID
    student_name: Optional[str] = None
    teacher_id: ID
    status: str
    requested_at: datetime
    responded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MediaRoomOverviewResponse(BaseModel):
    exam_id: ID
    room_name: str
    status: str
    total_enrolled: int
    connected_count: int
    active_streamers: int
    alert_count: int
    students: List[Dict[str, Any]]


# ==========================================
# Compiler & Practice Schemas
# ==========================================
class ExecuteCodeRequest(BaseModel):
    language: Literal["c", "cpp", "java", "python"]
    code: str
    stdin: Optional[str] = ""
    filename: Optional[str] = None


class ExecuteCodeResponse(BaseModel):
    status: Literal[
        "success",
        "compilation_error",
        "runtime_error",
        "timed_out",
        "memory_limit_exceeded",
        "unavailable",
        "system_error"
    ]
    stdout: str = ""
    stderr: str = ""
    compilation_error: Optional[str] = None
    execution_time_ms: int = 0
    memory_kb: Optional[int] = None
    exit_code: Optional[int] = None
    security_enforced: Dict[str, Any] = Field(default_factory=dict)


class RuntimeInfo(BaseModel):
    name: str
    language: str
    is_available: bool
    version: Optional[str] = None
    binary_path: Optional[str] = None
    error_message: Optional[str] = None
    setup_guide: Optional[Dict[str, Any]] = None


class CompilerStatusResponse(BaseModel):
    runtimes: Dict[str, RuntimeInfo]
    isolation_info: Dict[str, Any]


class PracticeFileCreate(BaseModel):
    language: Literal["c", "cpp", "java", "python"]
    filename: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = ""
    stdin: Optional[str] = ""


class PracticeFileUpdate(BaseModel):
    filename: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = None
    stdin: Optional[str] = None
    is_active: Optional[bool] = None


class PracticeFileResponse(BaseModel):
    id: ID
    user_id: ID
    language: str
    filename: str
    code: str
    stdin: Optional[str] = ""
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SampleProgram(BaseModel):
    id: str
    title: str
    description: str
    filename: str
    language: Literal["c", "cpp", "java", "python"]
    code: str
    stdin: Optional[str] = ""


# ==========================================
# Class Notes Schemas
# ==========================================
class ClassNoteUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    subject: Optional[str] = None
    category: Optional[str] = None
    is_published: Optional[bool] = None


class ClassNoteResponse(BaseModel):
    id: ID
    classroom_id: ID
    classroom_title: Optional[str] = None
    classroom_subject_code: Optional[str] = None
    teacher_id: ID
    teacher_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    subject: Optional[str] = None
    category: str
    original_filename: str
    file_size_bytes: int
    mime_type: str
    file_extension: str
    is_published: bool
    download_count: int
    created_at: datetime
    updated_at: datetime
    download_url: Optional[str] = None
    preview_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)



