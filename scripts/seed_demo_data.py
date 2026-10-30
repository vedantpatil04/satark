import os
import sys
from datetime import datetime, timezone, timedelta

# Add workspace root to sys.path
sys.path.insert(0, os.path.abspath("."))

from backend.app.core.database import SessionLocal, init_db
from backend.app.core.security import hash_password
from backend.app.models import (
    User, StudentProfile, Classroom, ClassroomEnrollment,
    Device, ExamSession, FocusSession, ActivityEvent, Alert, Notification, AuditLog
)


def seed():
    print("Initializing database schema...")
    init_db()
    db = SessionLocal()

    try:
        now = datetime.now(timezone.utc)
        print("Seeding demo accounts and entities...")

        # ---------------------------------------------------------
        # 1. Teacher Account
        # ---------------------------------------------------------
        teacher_email = "teacher@smartclassroom.edu"
        teacher = db.query(User).filter(User.email == teacher_email).first()
        if not teacher:
            teacher = User(
                email=teacher_email,
                hashed_password=hash_password("Password123!"),
                full_name="Prof. Robert Langdon",
                role="teacher",
                is_active=True,
            )
            db.add(teacher)
            db.commit()
            db.refresh(teacher)
            print(f" Created Teacher: {teacher.email} (Password123!)")
        else:
            print(f" Teacher already exists: {teacher.email}")

        # ---------------------------------------------------------
        # 2. Student Accounts
        # ---------------------------------------------------------
        students_data = [
            ("alice@smartclassroom.edu", "Alice Johnson", "CS2026-001", "Computer Science", 6),
            ("bob@smartclassroom.edu", "Bob Smith", "CS2026-002", "Information Security", 6),
            ("charlie@smartclassroom.edu", "Charlie Davis", "CS2026-003", "Data Science", 4),
        ]

        students = []
        for email, name, roll, major, sem in students_data:
            stud = db.query(User).filter(User.email == email).first()
            if not stud:
                stud = User(
                    email=email,
                    hashed_password=hash_password("Password123!"),
                    full_name=name,
                    role="student",
                    is_active=True,
                )
                db.add(stud)
                db.commit()
                db.refresh(stud)

                profile = StudentProfile(
                    user_id=stud.id,
                    student_id_number=roll,
                    branch_or_major=major,
                    semester=sem,
                )
                db.add(profile)
                db.commit()
                print(f" Created Student: {stud.email} ({roll})")
            students.append(stud)

        # ---------------------------------------------------------
        # 3. Classrooms
        # ---------------------------------------------------------
        classrooms_data = [
            ("CS-401: Distributed Systems & Security", "CS401X", "Advanced distributed architectures, consensus, and operating system virtualization security."),
            ("AI-302: Computer Vision & Edge Systems", "AI302E", "Real-time edge neural inference and facial landmark geometry."),
        ]

        classrooms = []
        for name, code, desc in classrooms_data:
            cr = db.query(Classroom).filter(Classroom.join_code == code).first()
            if not cr:
                cr = Classroom(
                    teacher_id=teacher.id,
                    title=name,
                    subject_code=code,
                    join_code=code,
                    description=desc,
                )
                db.add(cr)
                db.commit()
                db.refresh(cr)
                print(f" Created Classroom: {cr.title} [PIN: {cr.join_code}]")
            classrooms.append(cr)

        # Enroll students in classrooms
        for cr in classrooms:
            for st in students:
                existing_enroll = db.query(ClassroomEnrollment).filter(
                    ClassroomEnrollment.classroom_id == cr.id,
                    ClassroomEnrollment.student_id == st.id,
                ).first()
                if not existing_enroll:
                    enrollment = ClassroomEnrollment(
                        classroom_id=cr.id,
                        student_id=st.id,
                    )
                    db.add(enrollment)
        db.commit()
        print(" Enrolled demo students in classroom cohorts.")

        # ---------------------------------------------------------
        # 4. Workstation Devices
        # ---------------------------------------------------------
        dev1 = db.query(Device).filter(Device.hardware_uuid == "a4e1d823-902f-5784-bb3f-12908f9021a4").first()
        if not dev1:
            dev1 = Device(
                hardware_uuid="a4e1d823-902f-5784-bb3f-12908f9021a4",
                hostname="DESKTOP-ALICE-WIN11",
                os_type="windows",
                os_version="Windows 11 Pro 23H2",
                agent_version="1.0.0",
                owner_user_id=students[0].id,
                last_heartbeat_at=now,
                status="connected",
            )
            db.add(dev1)

        dev2 = db.query(Device).filter(Device.hardware_uuid == "b7f2c914-118a-4421-9d1e-84192a013f99").first()
        if not dev2:
            dev2 = Device(
                hardware_uuid="b7f2c914-118a-4421-9d1e-84192a013f99",
                hostname="LAPTOP-BOB-UBUNTU",
                os_type="linux",
                os_version="Ubuntu 24.04 LTS",
                agent_version="1.0.0",
                owner_user_id=students[1].id,
                last_heartbeat_at=now - timedelta(seconds=4),
                status="connected",
            )
            db.add(dev2)
        db.commit()
        print(" Created workstation hardware devices.")

        # ---------------------------------------------------------
        # 5. Examinations
        # ---------------------------------------------------------
        exam_code = "CS401M"
        exam = db.query(ExamSession).filter(ExamSession.exam_code == exam_code).first()
        if not exam:
            exam = ExamSession(
                classroom_id=classrooms[0].id,
                teacher_id=teacher.id,
                title="CS-401 Midterm Examination",
                description="Comprehensive evaluation on network protocols, mutual exclusion, and virtualization integrity.",
                exam_code=exam_code,
                duration_minutes=60,
                scheduled_start=now - timedelta(minutes=10),
                actual_start=now - timedelta(minutes=10),
                status="active",
                policy_config={
                    "lockdown_browser": True,
                    "screen_share": True,
                    "audio_monitoring": False,
                    "single_monitor_required": True,
                    "restricted_processes": ["discord.exe", "cheatengine.exe", "obs64.exe", "anydesk.exe"],
                },
            )
            db.add(exam)
            db.commit()
            db.refresh(exam)
            print(f" Created Active Exam: {exam.title} [PIN: {exam.exam_code}]")

        # ---------------------------------------------------------
        # 6. Integrity Alerts
        # ---------------------------------------------------------
        existing_alerts = db.query(Alert).filter(Alert.session_id == exam.id).count()
        if existing_alerts == 0:
            alert1 = Alert(
                session_id=exam.id,
                student_id=students[0].id,
                device_id=dev1.id,
                alert_type="restricted_app",
                severity="high",
                description="Integrity Rule Trigger: Restricted App (Process: discord.exe)",
                evidence_summary={
                    "occurred_at": (now - timedelta(minutes=3)).isoformat(),
                    "source": "agent",
                    "details": {
                        "process_name": "discord.exe",
                        "rule": "Restricted Process Policy",
                        "reason": "Disallowed application 'discord.exe' detected in foreground",
                    },
                },
                is_acknowledged=False,
            )
            db.add(alert1)

            alert2 = Alert(
                session_id=exam.id,
                student_id=students[1].id,
                device_id=dev2.id,
                alert_type="multi_display_detected",
                severity="critical",
                description="Integrity Rule Trigger: Multi Display Detected (Monitors: 2)",
                evidence_summary={
                    "occurred_at": (now - timedelta(minutes=1)).isoformat(),
                    "source": "agent",
                    "details": {
                        "display_count": 2,
                        "reason": "Secondary monitor connection violates single_monitor_required policy",
                    },
                },
                is_acknowledged=False,
            )
            db.add(alert2)
            db.commit()
            print(" Created sample integrity violation alerts.")

        # ---------------------------------------------------------
        # 7. Focus Mode Sessions
        # ---------------------------------------------------------
        existing_focus = db.query(FocusSession).filter(FocusSession.student_id == students[0].id).count()
        if existing_focus == 0:
            f1 = FocusSession(
                student_id=students[0].id,
                classroom_id=classrooms[0].id,
                goal_title="Master Distributed Hash Tables (DHT)",
                planned_duration_minutes=25,
                actual_focus_seconds=1500,
                actual_break_seconds=300,
                status="completed",
                started_at=now - timedelta(hours=2),
                ended_at=now - timedelta(hours=1, minutes=30),
                notes="Excellent stamina! 100% focus score with zero distractions.",
            )
            db.add(f1)

            f2 = FocusSession(
                student_id=students[1].id,
                classroom_id=classrooms[1].id,
                goal_title="TensorFlow Edge Inference Setup",
                planned_duration_minutes=45,
                actual_focus_seconds=2700,
                actual_break_seconds=420,
                status="completed",
                started_at=now - timedelta(days=1),
                ended_at=now - timedelta(days=1, minutes=-45),
                notes="Completed initial edge model deployment.",
            )
            db.add(f2)
            db.commit()
            print(" Created student focus study history.")

        # ---------------------------------------------------------
        # 8. Notifications
        # ---------------------------------------------------------
        n1 = Notification(
            user_id=students[0].id,
            title="Midterm Examination Live",
            message="CS-401 Midterm Examination is now active. Launch the exam portal with PIN CS401M.",
            notification_type="exam_announcement",
            is_read=False,
        )
        n2 = Notification(
            user_id=students[0].id,
            title="Great Focus Momentum!",
            message="You completed a 25-minute Pomodoro study sprint with a 100% focus stamina score.",
            notification_type="focus_nudge",
            is_read=True,
        )
        db.add(n1)
        db.add(n2)
        db.commit()
        print(" Created student notifications.")

        # ---------------------------------------------------------
        # 9. Audit Log
        # ---------------------------------------------------------
        log1 = AuditLog(
            action="SYSTEM_INITIALIZED",
            actor_user_id=teacher.id,
            target_resource="CORE_SYSTEM",
            ip_address="127.0.0.1",
            details={"version": "1.0.0", "phase": "1.5"},
        )
        db.add(log1)
        db.commit()

        print("\n========================================================")
        print("  DEMO DATA SEEDING COMPLETE! ")
        print("========================================================")
        print("Teacher Login:  teacher@smartclassroom.edu / Password123!")
        print("Student Login:  alice@smartclassroom.edu   / Password123!")
        print("Student Login:  bob@smartclassroom.edu     / Password123!")
        print("Classroom Join: CS401X")
        print("Exam PIN:       CS401M")
        print("========================================================\n")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
