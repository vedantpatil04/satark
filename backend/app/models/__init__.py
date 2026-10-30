import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False, index=True)  # 'teacher' or 'student'
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    owned_classrooms = relationship("Classroom", back_populates="teacher", foreign_keys="Classroom.teacher_id")
    enrollments = relationship("ClassroomEnrollment", back_populates="student", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="owner")
    proctored_exams = relationship("ExamSession", back_populates="teacher", foreign_keys="ExamSession.teacher_id")
    focus_sessions = relationship("FocusSession", back_populates="student", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    student_id_number = Column(String(50), unique=True, nullable=False, index=True)
    branch_or_major = Column(String(100), nullable=True)
    semester = Column(Integer, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User", back_populates="student_profile")


class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    teacher_id = Column(String(36), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    subject_code = Column(String(30), nullable=True)
    description = Column(Text, nullable=True)
    join_code = Column(String(8), unique=True, nullable=False, index=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    teacher = relationship("User", back_populates="owned_classrooms", foreign_keys=[teacher_id])
    enrollments = relationship("ClassroomEnrollment", back_populates="classroom", cascade="all, delete-orphan")
    exams = relationship("ExamSession", back_populates="classroom")
    focus_sessions = relationship("FocusSession", back_populates="classroom")


class ClassroomEnrollment(Base):
    __tablename__ = "classroom_enrollments"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    enrolled_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("classroom_id", "student_id", name="uq_classroom_student"),
    )

    classroom = relationship("Classroom", back_populates="enrollments")
    student = relationship("User", back_populates="enrollments")


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hardware_uuid = Column(String(100), unique=True, nullable=False, index=True)
    hostname = Column(String(120), nullable=True)
    os_type = Column(String(20), nullable=False)  # 'windows', 'linux', 'macos'
    os_version = Column(String(50), nullable=True)
    agent_version = Column(String(20), nullable=False)
    owner_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    last_heartbeat_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="offline", nullable=False, index=True)  # 'connected', 'inactive', 'offline'
    created_at = Column(DateTime, default=utc_now, nullable=False)

    owner = relationship("User", back_populates="devices")
    sessions = relationship("DeviceSession", back_populates="device", cascade="all, delete-orphan")
    events = relationship("ActivityEvent", back_populates="device")


class DeviceSession(Base):
    __tablename__ = "device_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="RESTRICT"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    session_id = Column(String(36), nullable=False, index=True)  # exam_sessions.id or focus_sessions.id
    mode = Column(String(10), nullable=False)  # 'exam' or 'focus'
    connected_at = Column(DateTime, default=utc_now, nullable=False)
    disconnected_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    device = relationship("Device", back_populates="sessions")
    student = relationship("User")


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="RESTRICT"), nullable=False, index=True)
    teacher_id = Column(String(36), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    exam_code = Column(String(10), unique=True, nullable=False, index=True)
    duration_minutes = Column(Integer, default=60, nullable=False)
    scheduled_start = Column(DateTime, nullable=False)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft", nullable=False, index=True)  # 'draft', 'scheduled', 'active', 'paused', 'ended'
    policy_config = Column(JSON, default=dict, nullable=False)  # Configurable rules (window_blur, blacklist, etc.)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    classroom = relationship("Classroom", back_populates="exams")
    teacher = relationship("User", back_populates="proctored_exams", foreign_keys=[teacher_id])
    alerts = relationship("Alert", back_populates="exam", cascade="all, delete-orphan")
    questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan", order_by="ExamQuestion.order_num")
    submissions = relationship("ExamSubmission", back_populates="exam", cascade="all, delete-orphan")


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True, index=True)
    goal_title = Column(String(200), nullable=False)
    planned_duration_minutes = Column(Integer, default=25, nullable=False)
    actual_focus_seconds = Column(Integer, default=0, nullable=False)
    actual_break_seconds = Column(Integer, default=0, nullable=False)
    status = Column(String(20), default="active", nullable=False, index=True)  # 'active', 'paused', 'completed', 'abandoned'
    started_at = Column(DateTime, default=utc_now, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    student = relationship("User", back_populates="focus_sessions")
    classroom = relationship("Classroom", back_populates="focus_sessions")


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id = Column(String(36), primary_key=True)  # event_id (UUIDv4) for duplicate rejection
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="SET NULL"), nullable=True, index=True)
    session_id = Column(String(36), nullable=False, index=True)
    mode = Column(String(10), nullable=False)  # 'exam' or 'focus'
    event_category = Column(String(30), nullable=False)  # 'activity_event', 'heartbeat', 'connectivity_event'
    event_type = Column(String(50), nullable=False, index=True)
    source = Column(String(20), default="agent", nullable=False)  # 'agent', 'server', 'demo', 'web_client'
    severity = Column(String(20), default="low", nullable=False)  # 'low', 'medium', 'high', 'critical'
    occurred_at = Column(DateTime, nullable=False, index=True)
    received_at = Column(DateTime, default=utc_now, nullable=False)
    details = Column(JSON, default=dict, nullable=False)

    device = relationship("Device", back_populates="events")
    student = relationship("User")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    primary_event_id = Column(String(36), ForeignKey("activity_events.id", ondelete="SET NULL"), nullable=True)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)  # 'low', 'medium', 'high', 'critical'
    description = Column(Text, nullable=False)
    evidence_summary = Column(JSON, default=dict, nullable=True)
    is_acknowledged = Column(Boolean, default=False, nullable=False, index=True)
    acknowledged_by = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    proctor_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    exam = relationship("ExamSession", back_populates="alerts")
    student = relationship("User", foreign_keys=[student_id])
    device = relationship("Device")
    reviewer = relationship("User", foreign_keys=[acknowledged_by])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(30), nullable=False)  # 'exam_announcement', 'focus_nudge', 'security'
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User", back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    actor_user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(80), nullable=False)  # 'EXAM_STARTED', 'ALERT_ACKNOWLEDGED', etc.
    target_resource = Column(String(80), nullable=True)
    ip_address = Column(String(45), nullable=True)
    details = Column(JSON, default=dict, nullable=True)
    timestamp = Column(DateTime, default=utc_now, nullable=False, index=True)

    actor = relationship("User", foreign_keys=[actor_user_id])


class ExamQuestion(Base):
    __tablename__ = "exam_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    exam_id = Column(String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # List[str] with 4 choices
    correct_option_index = Column(Integer, nullable=False)  # 0, 1, 2, or 3
    marks = Column(Integer, default=1, nullable=False)
    order_num = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    exam = relationship("ExamSession", back_populates="questions")
    answers = relationship("StudentAnswer", back_populates="question", cascade="all, delete-orphan")


class ExamSubmission(Base):
    __tablename__ = "exam_submissions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    exam_id = Column(String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    score = Column(Integer, default=0, nullable=False)
    total_marks = Column(Integer, default=0, nullable=False)
    percentage = Column(Integer, default=0, nullable=False)
    status = Column(String(20), default="submitted", nullable=False, index=True)  # 'submitted', 'graded'
    submitted_at = Column(DateTime, default=utc_now, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_exam_student_submission"),
    )

    exam = relationship("ExamSession", back_populates="submissions")
    student = relationship("User")
    answers = relationship("StudentAnswer", back_populates="submission", cascade="all, delete-orphan")


class StudentAnswer(Base):
    __tablename__ = "student_answers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    submission_id = Column(String(36), ForeignKey("exam_submissions.id", ondelete="CASCADE"), nullable=True, index=True)
    exam_id = Column(String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(String(36), ForeignKey("exam_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    selected_option_index = Column(Integer, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Integer, default=0, nullable=False)
    answered_at = Column(DateTime, default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", "question_id", name="uq_exam_student_question_answer"),
    )

    question = relationship("ExamQuestion", back_populates="answers")
    submission = relationship("ExamSubmission", back_populates="answers")
    student = relationship("User")
    exam = relationship("ExamSession")


