import sqlite3
from pathlib import Path

db_path = Path("data/satark.db")
if not db_path.exists():
    print("Database does not exist yet at data/satark.db")
    exit(0)

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

def add_col_if_missing(table: str, col: str, col_type: str):
    cols = [r[1] for r in cursor.execute(f"PRAGMA table_info({table})").fetchall()]
    if col not in cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
        print(f"Added {col} to {table}")
    else:
        print(f"{col} already exists in {table}")

add_col_if_missing("exam_questions", "question_type", "VARCHAR(20) DEFAULT 'mcq'")
add_col_if_missing("exam_questions", "correct_answers", "JSON DEFAULT '[]'")
add_col_if_missing("exam_questions", "explanation", "TEXT")
add_col_if_missing("student_answers", "selected_options", "JSON DEFAULT '[]'")
add_col_if_missing("student_answers", "text_answer", "TEXT")
add_col_if_missing("media_session_participants", "is_camera_streaming", "BOOLEAN DEFAULT 0")

conn.commit()
conn.close()
print("Migration completed successfully.")

