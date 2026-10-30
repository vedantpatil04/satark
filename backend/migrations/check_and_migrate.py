import os
import sys
import json
import sqlite3
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://postgres.ugsizlimcnxtbzkwficf:Amolk5223g%40%40@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
SQLITE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "smart_classroom.db")

def main():
    print("Connecting to SQLite and Supabase PostgreSQL...")
    s_conn = sqlite3.connect(SQLITE_PATH)
    s_conn.row_factory = sqlite3.Row
    s_cur = s_conn.cursor()

    pg_conn = psycopg2.connect(DB_URL)
    pg_conn.autocommit = True
    pg_cur = pg_conn.cursor()

    print("Connected successfully!")

    # 0. Clean test user
    pg_cur.execute("DELETE FROM public.profiles WHERE email = 'test@school.edu'")

    # 1. Profiles
    users = s_cur.execute("SELECT * FROM users").fetchall()
    print(f"Migrating {len(users)} users to public.profiles...")
    for u in users:
        pg_cur.execute("""
            INSERT INTO public.profiles (id, email, hashed_password, full_name, role, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                hashed_password = EXCLUDED.hashed_password,
                full_name = EXCLUDED.full_name,
                role = EXCLUDED.role,
                is_active = EXCLUDED.is_active;
        """, (
            str(u["id"]),
            u["email"],
            u["hashed_password"],
            u["full_name"],
            u["role"],
            bool(u["is_active"]),
            u["created_at"],
            u["updated_at"]
        ))
    print(f"  [OK] Profiles migrated.")

    # 2. Student Profiles
    try:
        pg_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'student_profiles'")
        pg_sp_cols = [r[0] for r in pg_cur.fetchall()]
        print(f"Postgres student_profiles columns: {pg_sp_cols}")
        s_profiles = s_cur.execute("SELECT * FROM student_profiles").fetchall()
        print(f"Migrating {len(s_profiles)} student_profiles...")
        for sp in s_profiles:
            sp_d = dict(sp)
            student_id = sp_d.get("student_id") or sp_d.get("user_id")
            pg_cur.execute("""
                INSERT INTO public.student_profiles (id, student_id, roll_number, current_gpa, target_gpa, streak_days, total_study_minutes, xp_points, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (student_id) DO NOTHING;
            """, (
                str(sp_d.get("id")),
                str(student_id),
                sp_d.get("roll_number") or sp_d.get("student_id_number") or "N/A",
                sp_d.get("current_gpa", 0.0) or 0.0,
                sp_d.get("target_gpa", 0.0) or 0.0,
                sp_d.get("streak_days", 0) or 0,
                sp_d.get("total_study_minutes", 0) or 0,
                sp_d.get("xp_points", 0) or 0,
                sp_d.get("created_at"),
                sp_d.get("updated_at") or sp_d.get("created_at")
            ))
        print("  [OK] Student profiles migrated.")
    except Exception as e:
        print(f"  [SKIP / ERROR] student_profiles: {e}")

    # 3. Classrooms
    classrooms = s_cur.execute("SELECT * FROM classrooms").fetchall()
    print(f"Migrating {len(classrooms)} classrooms...")
    for c in classrooms:
        pg_cur.execute("""
            INSERT INTO public.classrooms (id, teacher_id, title, subject_code, description, join_code, is_archived, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(c["id"]),
            str(c["teacher_id"]),
            c["title"],
            c["subject_code"],
            c["description"],
            c["join_code"],
            bool(c["is_archived"]),
            c["created_at"]
        ))
    print("  [OK] Classrooms migrated.")

    # 4. Enrollments
    enrollments = s_cur.execute("SELECT * FROM classroom_enrollments").fetchall()
    print(f"Migrating {len(enrollments)} classroom_enrollments...")
    for e in enrollments:
        pg_cur.execute("""
            INSERT INTO public.classroom_enrollments (id, classroom_id, student_id, enrolled_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (classroom_id, student_id) DO NOTHING;
        """, (
            str(e["id"]),
            str(e["classroom_id"]),
            str(e["student_id"]),
            e["enrolled_at"]
        ))
    print("  [OK] Classroom enrollments migrated.")

    # 5. Devices
    devices = s_cur.execute("SELECT * FROM devices").fetchall()
    print(f"Migrating {len(devices)} devices...")
    for d in devices:
        pg_cur.execute("""
            INSERT INTO public.devices (id, hardware_uuid, hostname, os_type, os_version, agent_version, owner_user_id, last_heartbeat_at, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (hardware_uuid) DO NOTHING;
        """, (
            str(d["id"]),
            str(d["hardware_uuid"]),
            d["hostname"],
            d["os_type"],
            d["os_version"],
            d["agent_version"],
            str(d["owner_user_id"]) if d["owner_user_id"] else None,
            d["last_heartbeat_at"],
            d["status"],
            d["created_at"]
        ))
    print("  [OK] Devices migrated.")

    # 6. Exam Sessions
    exams = s_cur.execute("SELECT * FROM exam_sessions").fetchall()
    print(f"Migrating {len(exams)} exam_sessions...")
    for ex in exams:
        pol = ex["policy_config"]
        if isinstance(pol, (dict, list)):
            pol = json.dumps(pol)
        elif not pol:
            pol = "{}"
        pg_cur.execute("""
            INSERT INTO public.exam_sessions (id, classroom_id, teacher_id, title, description, exam_code, duration_minutes, scheduled_start, actual_start, actual_end, status, policy_config, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(ex["id"]),
            str(ex["classroom_id"]),
            str(ex["teacher_id"]),
            ex["title"],
            ex["description"],
            ex["exam_code"],
            ex["duration_minutes"],
            ex["scheduled_start"],
            ex["actual_start"],
            ex["actual_end"],
            ex["status"],
            pol,
            ex["created_at"]
        ))
    print("  [OK] Exam sessions migrated.")

    # 7. Exam Questions
    questions = s_cur.execute("SELECT * FROM exam_questions").fetchall()
    print(f"Migrating {len(questions)} exam_questions...")
    for q in questions:
        opts = q["options"]
        if isinstance(opts, (dict, list)):
            opts = json.dumps(opts)
        elif not opts:
            opts = "[]"
        pg_cur.execute("""
            INSERT INTO public.exam_questions (id, exam_id, question_text, options, correct_option_index, marks, order_num, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(q["id"]),
            str(q["exam_id"]),
            q["question_text"],
            opts,
            q["correct_option_index"],
            q["marks"],
            q["order_num"],
            q["created_at"],
            q["updated_at"]
        ))
    print("  [OK] Exam questions migrated.")

    # 8. Exam Submissions
    submissions = s_cur.execute("SELECT * FROM exam_submissions").fetchall()
    print(f"Migrating {len(submissions)} exam_submissions...")
    for sub in submissions:
        pg_cur.execute("""
            INSERT INTO public.exam_submissions (id, exam_id, student_id, score, total_marks, percentage, status, submitted_at, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (exam_id, student_id) DO NOTHING;
        """, (
            str(sub["id"]),
            str(sub["exam_id"]),
            str(sub["student_id"]),
            sub["score"],
            sub["total_marks"],
            sub["percentage"],
            sub["status"],
            sub["submitted_at"],
            sub["created_at"]
        ))
    print("  [OK] Exam submissions migrated.")

    # 9. Student Answers
    answers = s_cur.execute("SELECT * FROM student_answers").fetchall()
    print(f"Migrating {len(answers)} student_answers...")
    for a in answers:
        is_corr = bool(a["is_correct"]) if a["is_correct"] is not None else None
        submission_id = str(a["submission_id"]) if a["submission_id"] else None
        pg_cur.execute("""
            INSERT INTO public.student_answers (id, submission_id, exam_id, student_id, question_id, selected_option_index, is_correct, marks_awarded, answered_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (exam_id, student_id, question_id) DO NOTHING;
        """, (
            str(a["id"]),
            submission_id,
            str(a["exam_id"]),
            str(a["student_id"]),
            str(a["question_id"]),
            a["selected_option_index"],
            is_corr,
            a["marks_awarded"],
            a["answered_at"]
        ))
    print("  [OK] Student answers migrated.")

    # 10. Focus Sessions
    focus_sessions = s_cur.execute("SELECT * FROM focus_sessions").fetchall()
    print(f"Migrating {len(focus_sessions)} focus_sessions...")
    for fs in focus_sessions:
        pg_cur.execute("""
            INSERT INTO public.focus_sessions (id, student_id, classroom_id, goal_title, planned_duration_minutes, actual_focus_seconds, actual_break_seconds, status, started_at, ended_at, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(fs["id"]),
            str(fs["student_id"]),
            str(fs["classroom_id"]) if fs["classroom_id"] else None,
            fs["goal_title"],
            fs["planned_duration_minutes"],
            fs["actual_focus_seconds"],
            fs["actual_break_seconds"],
            fs["status"],
            fs["started_at"],
            fs["ended_at"],
            fs["notes"]
        ))
    print("  [OK] Focus sessions migrated.")

    # 11. Activity Events
    events = s_cur.execute("SELECT * FROM activity_events").fetchall()
    print(f"Migrating {len(events)} activity_events...")
    for ev in events:
        dtl = ev["details"]
        if isinstance(dtl, (dict, list)):
            dtl = json.dumps(dtl)
        elif not dtl:
            dtl = "{}"
        pg_cur.execute("""
            INSERT INTO public.activity_events (id, device_id, student_id, classroom_id, session_id, mode, event_category, event_type, source, severity, occurred_at, received_at, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(ev["id"]),
            str(ev["device_id"]) if ev["device_id"] else None,
            str(ev["student_id"]) if ev["student_id"] else None,
            str(ev["classroom_id"]) if ev["classroom_id"] else None,
            str(ev["session_id"]) if ev["session_id"] else None,
            ev["mode"],
            ev["event_category"],
            ev["event_type"],
            ev["source"],
            ev["severity"],
            ev["occurred_at"],
            ev["received_at"],
            dtl
        ))
    print("  [OK] Activity events migrated.")

    # 12. Alerts
    alerts = s_cur.execute("SELECT * FROM alerts").fetchall()
    print(f"Migrating {len(alerts)} alerts...")
    for alt in alerts:
        es = alt["evidence_summary"]
        if isinstance(es, (dict, list)):
            es = json.dumps(es)
        elif not es:
            es = "{}"
        pg_cur.execute("""
            INSERT INTO public.alerts (id, session_id, student_id, device_id, primary_event_id, alert_type, severity, description, evidence_summary, is_acknowledged, acknowledged_by, acknowledged_at, proctor_notes, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(alt["id"]),
            str(alt["session_id"]) if alt["session_id"] else None,
            str(alt["student_id"]) if alt["student_id"] else None,
            str(alt["device_id"]) if alt["device_id"] else None,
            str(alt["primary_event_id"]) if alt["primary_event_id"] else None,
            alt["alert_type"],
            alt["severity"],
            alt["description"],
            es,
            bool(alt["is_acknowledged"]),
            str(alt["acknowledged_by"]) if alt["acknowledged_by"] else None,
            alt["acknowledged_at"],
            alt["proctor_notes"],
            alt["created_at"]
        ))
    print("  [OK] Alerts migrated.")

    # 13. Notifications
    notifications = s_cur.execute("SELECT * FROM notifications").fetchall()
    print(f"Migrating {len(notifications)} notifications...")
    for n in notifications:
        pg_cur.execute("""
            INSERT INTO public.notifications (id, user_id, title, message, notification_type, is_read, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(n["id"]),
            str(n["user_id"]),
            n["title"],
            n["message"],
            n["notification_type"],
            bool(n["is_read"]),
            n["created_at"]
        ))
    print("  [OK] Notifications migrated.")

    # 14. Audit Logs
    audit_logs = s_cur.execute("SELECT * FROM audit_logs").fetchall()
    print(f"Migrating {len(audit_logs)} audit_logs...")
    for al in audit_logs:
        dtl = al["details"]
        if isinstance(dtl, (dict, list)):
            dtl = json.dumps(dtl)
        elif not dtl:
            dtl = "{}"
        pg_cur.execute("""
            INSERT INTO public.audit_logs (id, actor_user_id, action, target_resource, ip_address, details, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (
            str(al["id"]),
            str(al["actor_user_id"]) if al["actor_user_id"] else None,
            al["action"],
            al["target_resource"],
            al["ip_address"],
            dtl,
            al["timestamp"]
        ))
    print("  [OK] Audit logs migrated.")

    print("\nALL DATA SUCCESSFULLY MIGRATED TO SUPABASE POSTGRESQL!")
    pg_conn.close()
    s_conn.close()

if __name__ == "__main__":
    main()
