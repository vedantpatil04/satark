"""
SATARK — SQLite to Supabase PostgreSQL Migration Tool
Usage:
    python backend/migrations/migrate_sqlite_to_supabase.py [--dry-run] [--db-url postgresql://...]
"""

import os
import sys
import argparse
import sqlite3
import json
from datetime import datetime
from sqlalchemy import create_engine, text

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "smart_classroom.db")
SCHEMA_SQL_PATH = os.path.join(os.path.dirname(__file__), "001_initial_supabase_schema.sql")


def get_pg_url(arg_url: str = None) -> str:
    if arg_url:
        return arg_url
    url = os.getenv("DATABASE_URL")
    if not url:
        env_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
            os.path.join(os.path.dirname(__file__), "..", ".env"),
        ]
        for p in env_paths:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("DATABASE_URL="):
                            url = line.strip().split("=", 1)[1].strip('"').strip("'")
                            break
            if url and "postgres" in url:
                break
    return url


def run_migration(dry_run: bool = False, db_url: str = None):
    print("=" * 60)
    print("SATARK — SQLite to Supabase PostgreSQL Migration Tool")
    print("=" * 60)

    # 1. Verify SQLite database
    if not os.path.exists(SQLITE_PATH):
        print(f"[ERROR] SQLite database not found at {SQLITE_PATH}")
        sys.exit(1)

    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    s_cur = sqlite_conn.cursor()

    # Check record counts in SQLite
    print("\n[1/4] SQLite Source Database Inspection:")
    tables = [
        "users", "student_profiles", "classrooms", "classroom_enrollments",
        "devices", "device_sessions", "exam_sessions", "focus_sessions",
        "activity_events", "alerts", "notifications", "audit_logs",
        "exam_questions", "exam_submissions", "student_answers"
    ]
    counts = {}
    for t in tables:
        try:
            cnt = s_cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            counts[t] = cnt
            print(f"  • {t:<22} : {cnt} rows")
        except Exception as e:
            counts[t] = 0
            print(f"  • {t:<22} : [Table missing or error: {e}]")

    # 2. Check Supabase PostgreSQL Connection
    pg_url = get_pg_url(db_url)
    if pg_url and pg_url.startswith("postgresql://"):
        pg_url = pg_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    print("\n[2/4] Supabase PostgreSQL Target Verification:")
    if not pg_url or "postgres" not in pg_url:
        print("  [BLOCKED] Valid PostgreSQL DATABASE_URL is not set.")
        print("  Please configure DATABASE_URL in .env (Transaction Pooler format):")
        print("  DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres")
        return False

    try:
        masked_url = pg_url.split("@")[1]
        print(f"  Target host: {masked_url}")
    except Exception:
        print("  Target: Custom connection string provided")

    if dry_run:
        print("  [DRY RUN] Skipping network connection and live writes.")
        return True

    try:
        pg_engine = create_engine(pg_url, pool_pre_ping=True)
        with pg_engine.connect() as conn:
            res = conn.execute(text("SELECT version();")).fetchone()
            print(f"  [SUCCESS] Connected to PostgreSQL: {res[0][:40]}...")
    except Exception as e:
        print(f"  [FAIL] Failed to connect to PostgreSQL: {e}")
        return False

    # 3. Apply Schema
    print("\n[3/4] Ensuring PostgreSQL Schema Compatibility...")
    with pg_engine.begin() as conn:
        conn.execute(text("ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);"))
        conn.execute(text("CREATE OR REPLACE VIEW public.users AS SELECT * FROM public.profiles;"))
    print("  [SUCCESS] Profiles and compatibility view verified.")

    # 4. Data Transfer
    print("\n[4/4] Migrating Records from SQLite to Supabase PostgreSQL...")
    with pg_engine.begin() as conn:
        # 4.1 Profiles (Users)
        users = s_cur.execute("SELECT * FROM users").fetchall()
        for u in users:
            conn.execute(
                text("""
                    INSERT INTO public.profiles (id, email, hashed_password, full_name, role, is_active, created_at, updated_at)
                    VALUES (:id, :email, :hashed_password, :full_name, :role, :is_active, :created_at, :updated_at)
                    ON CONFLICT (id) DO UPDATE SET 
                        email = EXCLUDED.email, 
                        hashed_password = EXCLUDED.hashed_password,
                        full_name = EXCLUDED.full_name,
                        role = EXCLUDED.role;
                """),
                {
                    "id": u["id"],
                    "email": u["email"],
                    "hashed_password": u["hashed_password"],
                    "full_name": u["full_name"],
                    "role": u["role"],
                    "is_active": bool(u["is_active"]),
                    "created_at": u["created_at"],
                    "updated_at": u["updated_at"],
                }
            )
        print(f"  • Migrated {len(users)} profiles.")

        # 4.2 Classrooms
        classrooms = s_cur.execute("SELECT * FROM classrooms").fetchall()
        for c in classrooms:
            row = dict(c)
            row["is_archived"] = bool(row.get("is_archived"))
            conn.execute(
                text("""
                    INSERT INTO public.classrooms (id, teacher_id, title, subject_code, description, join_code, is_archived, created_at)
                    VALUES (:id, :teacher_id, :title, :subject_code, :description, :join_code, :is_archived, :created_at)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(classrooms)} classrooms.")

        # 4.3 Classroom Enrollments
        enrollments = s_cur.execute("SELECT * FROM classroom_enrollments").fetchall()
        for e in enrollments:
            conn.execute(
                text("""
                    INSERT INTO public.classroom_enrollments (id, classroom_id, student_id, enrolled_at)
                    VALUES (:id, :classroom_id, :student_id, :enrolled_at)
                    ON CONFLICT (classroom_id, student_id) DO NOTHING;
                """),
                dict(e)
            )
        print(f"  • Migrated {len(enrollments)} classroom enrollments.")

        # 4.4 Devices
        devices = s_cur.execute("SELECT * FROM devices").fetchall()
        for d in devices:
            conn.execute(
                text("""
                    INSERT INTO public.devices (id, hardware_uuid, hostname, os_type, os_version, agent_version, owner_user_id, last_heartbeat_at, status, created_at)
                    VALUES (:id, :hardware_uuid, :hostname, :os_type, :os_version, :agent_version, :owner_user_id, :last_heartbeat_at, :status, :created_at)
                    ON CONFLICT (hardware_uuid) DO NOTHING;
                """),
                dict(d)
            )
        print(f"  • Migrated {len(devices)} devices.")

        # 4.5 Exam Sessions
        exams = s_cur.execute("SELECT * FROM exam_sessions").fetchall()
        for ex in exams:
            row = dict(ex)
            if isinstance(row.get("policy_config"), (dict, list)):
                row["policy_config"] = json.dumps(row["policy_config"])
            elif not row.get("policy_config"):
                row["policy_config"] = "{}"
            conn.execute(
                text("""
                    INSERT INTO public.exam_sessions (id, classroom_id, teacher_id, title, description, exam_code, duration_minutes, scheduled_start, actual_start, actual_end, status, policy_config, created_at)
                    VALUES (:id, :classroom_id, :teacher_id, :title, :description, :exam_code, :duration_minutes, :scheduled_start, :actual_start, :actual_end, :status, :policy_config, :created_at)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(exams)} exam sessions.")

        # 4.6 Exam Questions
        questions = s_cur.execute("SELECT * FROM exam_questions").fetchall()
        for q in questions:
            row = dict(q)
            if isinstance(row.get("options"), (dict, list)):
                row["options"] = json.dumps(row["options"])
            elif not row.get("options"):
                row["options"] = "[]"
            conn.execute(
                text("""
                    INSERT INTO public.exam_questions (id, exam_id, question_text, options, correct_option_index, marks, order_num, created_at, updated_at)
                    VALUES (:id, :exam_id, :question_text, :options, :correct_option_index, :marks, :order_num, :created_at, :updated_at)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(questions)} exam questions.")

        # 4.7 Exam Submissions
        submissions = s_cur.execute("SELECT * FROM exam_submissions").fetchall()
        for s in submissions:
            conn.execute(
                text("""
                    INSERT INTO public.exam_submissions (id, exam_id, student_id, score, total_marks, percentage, status, submitted_at, created_at)
                    VALUES (:id, :exam_id, :student_id, :score, :total_marks, :percentage, :status, :submitted_at, :created_at)
                    ON CONFLICT (exam_id, student_id) DO NOTHING;
                """),
                dict(s)
            )
        print(f"  • Migrated {len(submissions)} exam submissions.")

        # 4.8 Student Answers
        answers = s_cur.execute("SELECT * FROM student_answers").fetchall()
        for a in answers:
            row = dict(a)
            if row.get("is_correct") is not None:
                row["is_correct"] = bool(row["is_correct"])
            conn.execute(
                text("""
                    INSERT INTO public.student_answers (id, submission_id, exam_id, student_id, question_id, selected_option_index, is_correct, marks_awarded, answered_at)
                    VALUES (:id, :submission_id, :exam_id, :student_id, :question_id, :selected_option_index, :is_correct, :marks_awarded, :answered_at)
                    ON CONFLICT (exam_id, student_id, question_id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(answers)} student answers.")

        # 4.9 Focus Sessions
        focus_sessions = s_cur.execute("SELECT * FROM focus_sessions").fetchall()
        for fs in focus_sessions:
            conn.execute(
                text("""
                    INSERT INTO public.focus_sessions (id, student_id, classroom_id, goal_title, planned_duration_minutes, actual_focus_seconds, actual_break_seconds, status, started_at, ended_at, notes)
                    VALUES (:id, :student_id, :classroom_id, :goal_title, :planned_duration_minutes, :actual_focus_seconds, :actual_break_seconds, :status, :started_at, :ended_at, :notes)
                    ON CONFLICT (id) DO NOTHING;
                """),
                dict(fs)
            )
        print(f"  • Migrated {len(focus_sessions)} focus sessions.")

        # 4.10 Activity Events
        events = s_cur.execute("SELECT * FROM activity_events").fetchall()
        for ev in events:
            row = dict(ev)
            if isinstance(row.get("details"), (dict, list)):
                row["details"] = json.dumps(row["details"])
            elif not row.get("details"):
                row["details"] = "{}"
            conn.execute(
                text("""
                    INSERT INTO public.activity_events (id, device_id, student_id, classroom_id, session_id, mode, event_category, event_type, source, severity, occurred_at, received_at, details)
                    VALUES (:id, :device_id, :student_id, :classroom_id, :session_id, :mode, :event_category, :event_type, :source, :severity, :occurred_at, :received_at, :details)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(events)} activity events.")

        # 4.11 Alerts
        alerts = s_cur.execute("SELECT * FROM alerts").fetchall()
        for alt in alerts:
            row = dict(alt)
            row["is_acknowledged"] = bool(row.get("is_acknowledged"))
            if isinstance(row.get("evidence_summary"), (dict, list)):
                row["evidence_summary"] = json.dumps(row["evidence_summary"])
            elif not row.get("evidence_summary"):
                row["evidence_summary"] = "{}"
            conn.execute(
                text("""
                    INSERT INTO public.alerts (id, session_id, student_id, device_id, primary_event_id, alert_type, severity, description, evidence_summary, is_acknowledged, acknowledged_by, acknowledged_at, proctor_notes, created_at)
                    VALUES (:id, :session_id, :student_id, :device_id, :primary_event_id, :alert_type, :severity, :description, :evidence_summary, :is_acknowledged, :acknowledged_by, :acknowledged_at, :proctor_notes, :created_at)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(alerts)} alerts.")

        # 4.12 Notifications
        notifications = s_cur.execute("SELECT * FROM notifications").fetchall()
        for n in notifications:
            row = dict(n)
            row["is_read"] = bool(row.get("is_read"))
            conn.execute(
                text("""
                    INSERT INTO public.notifications (id, user_id, title, message, notification_type, is_read, created_at)
                    VALUES (:id, :user_id, :title, :message, :notification_type, :is_read, :created_at)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(notifications)} notifications.")

        # 4.13 Audit Logs
        audit_logs = s_cur.execute("SELECT * FROM audit_logs").fetchall()
        for al in audit_logs:
            row = dict(al)
            if isinstance(row.get("details"), (dict, list)):
                row["details"] = json.dumps(row["details"])
            elif not row.get("details"):
                row["details"] = "{}"
            conn.execute(
                text("""
                    INSERT INTO public.audit_logs (id, actor_user_id, action, target_resource, ip_address, details, timestamp)
                    VALUES (:id, :actor_user_id, :action, :target_resource, :ip_address, :details, :timestamp)
                    ON CONFLICT (id) DO NOTHING;
                """),
                row
            )
        print(f"  • Migrated {len(audit_logs)} audit logs.")

    print("\n[SUCCESS] SQLite to Supabase PostgreSQL migration complete!")
    sqlite_conn.close()
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SATARK Database Migration")
    parser.add_argument("--dry-run", action="store_true", help="Inspect without modifying")
    parser.add_argument("--db-url", type=str, help="PostgreSQL connection string")
    args = parser.parse_args()

    run_migration(dry_run=args.dry_run, db_url=args.db_url)
