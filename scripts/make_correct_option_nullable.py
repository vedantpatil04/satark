import sqlite3
from pathlib import Path

db_path = Path("data/satark.db")
if not db_path.exists():
    print("Database file not found!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute("PRAGMA foreign_keys = OFF;")
    cursor.execute("BEGIN TRANSACTION;")

    # 1. Create temporary new table with correct_option_index nullable
    cursor.execute("""
    CREATE TABLE exam_questions_new (
        id VARCHAR(36) PRIMARY KEY,
        exam_id VARCHAR(36) NOT NULL,
        question_text TEXT NOT NULL,
        options JSON NOT NULL,
        correct_option_index INTEGER,
        marks INTEGER NOT NULL DEFAULT 1,
        order_num INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        question_type VARCHAR(20) DEFAULT 'mcq',
        correct_answers JSON DEFAULT '[]',
        explanation TEXT,
        FOREIGN KEY(exam_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    );
    """)

    # 2. Copy existing data
    cursor.execute("""
    INSERT INTO exam_questions_new (
        id, exam_id, question_text, options, correct_option_index, marks,
        order_num, created_at, updated_at, question_type, correct_answers, explanation
    )
    SELECT 
        id, exam_id, question_text, options, correct_option_index, marks,
        order_num, created_at, updated_at, question_type, correct_answers, explanation
    FROM exam_questions;
    """)

    # 3. Drop old table and rename new table
    cursor.execute("DROP TABLE exam_questions;")
    cursor.execute("ALTER TABLE exam_questions_new RENAME TO exam_questions;")

    # 4. Recreate index
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_exam_questions_exam_id ON exam_questions (exam_id);")

    cursor.execute("COMMIT;")
    cursor.execute("PRAGMA foreign_keys = ON;")
    print("Successfully updated exam_questions to allow nullable correct_option_index!")
except Exception as e:
    cursor.execute("ROLLBACK;")
    print("Error during migration:", e)
    raise
finally:
    conn.close()

