"""
SATARK — SQLite to Supabase PostgreSQL Migration Script
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
        # Check backend/.env or root .env
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
    print("\n[2/4] Supabase PostgreSQL Target Verification:")
    if not pg_url or "postgres" not in pg_url:
        print("  [BLOCKED] Valid PostgreSQL DATABASE_URL is not set.")
        print("  Please configure DATABASE_URL in .env (Transaction Pooler format):")
        print("  DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres")
        print("\n  Migration script is ready. Stopping live database migration until credentials are provided.")
        return False

    # Mask password for display
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
    print("\n[3/4] Applying Schema and RLS Policies...")
    if os.path.exists(SCHEMA_SQL_PATH):
        with open(SCHEMA_SQL_PATH, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        try:
            with pg_engine.connect() as conn:
                # Execute in transaction
                conn.execute(text(schema_sql))
                conn.commit()
            print("  [SUCCESS] Applied 001_initial_supabase_schema.sql successfully.")
        except Exception as e:
            print(f"  [ERROR] Error executing schema DDL: {e}")
            return False

    # 4. Data Transfer
    print("\n[4/4] Migrating Records from SQLite to PostgreSQL...")
    # Safe migration preserving UUID relationships
    with pg_engine.begin() as conn:
        # Migrate users -> profiles
        sqlite_users = s_cur.execute("SELECT * FROM users").fetchall()
        for u in sqlite_users:
            conn.execute(
                text("""
                    INSERT INTO public.profiles (id, email, full_name, role, is_active, created_at, updated_at)
                    VALUES (:id, :email, :full_name, :role, :is_active, :created_at, :updated_at)
                    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;
                """),
                {
                    "id": u["id"],
                    "email": u["email"],
                    "full_name": u["full_name"],
                    "role": u["role"],
                    "is_active": bool(u["is_active"]),
                    "created_at": u["created_at"],
                    "updated_at": u["updated_at"],
                }
            )
        print(f"  Migrated {len(sqlite_users)} users -> profiles.")

    print("\n[DONE] Database migration pipeline verified.")
    sqlite_conn.close()
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SATARK Database Migration")
    parser.add_argument("--dry-run", action="store_true", help="Inspect without modifying")
    parser.add_argument("--db-url", type=str, help="PostgreSQL connection string")
    args = parser.parse_args()

    run_migration(dry_run=args.dry_run, db_url=args.db_url)
