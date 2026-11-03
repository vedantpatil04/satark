import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "satark.db")

def run_migration():
    print(f"Connecting to database at {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. exam_sessions
    cur.execute("PRAGMA table_info(exam_sessions)")
    exam_cols = [r[1] for r in cur.fetchall()]
    if "is_results_published" not in exam_cols:
        print("Adding is_results_published to exam_sessions...")
        cur.execute("ALTER TABLE exam_sessions ADD COLUMN is_results_published BOOLEAN DEFAULT 0 NOT NULL")
    if "passing_percentage" not in exam_cols:
        print("Adding passing_percentage to exam_sessions...")
        cur.execute("ALTER TABLE exam_sessions ADD COLUMN passing_percentage INTEGER DEFAULT 40 NOT NULL")

    # 2. exam_submissions
    cur.execute("PRAGMA table_info(exam_submissions)")
    sub_cols = [r[1] for r in cur.fetchall()]
    if "is_passed" not in sub_cols:
        print("Adding is_passed to exam_submissions...")
        cur.execute("ALTER TABLE exam_submissions ADD COLUMN is_passed BOOLEAN")

    # 3. student_answers
    cur.execute("PRAGMA table_info(student_answers)")
    ans_cols = [r[1] for r in cur.fetchall()]
    if "manual_score" not in ans_cols:
        print("Adding manual_score to student_answers...")
        cur.execute("ALTER TABLE student_answers ADD COLUMN manual_score INTEGER")
    if "feedback" not in ans_cols:
        print("Adding feedback to student_answers...")
        cur.execute("ALTER TABLE student_answers ADD COLUMN feedback TEXT")

    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    run_migration()

