"""
SATARK — Local Administration CLI
Usage:
    python -m backend.app.cli create-teacher [--email EMAIL] [--name NAME] [--password PASSWORD]
    python -m backend.app.cli reset-password --email EMAIL [--password PASSWORD]
    python -m backend.app.cli backup-db
    python -m backend.app.cli init-db
"""

import os
import sys
import getpass
import argparse
import shutil
from datetime import datetime
from pathlib import Path

# Add backend directory to sys.path if not present
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent
root_dir = backend_dir.parent
for p in [str(root_dir), str(backend_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.core.database import SessionLocal, init_db as run_init_db, DEFAULT_SQLITE_PATH
from backend.app.core.security import hash_password
from backend.app.models import User, AuditLog


def create_teacher(email: str = None, full_name: str = None, password: str = None):
    print("=" * 60)
    print("SATARK — Teacher Account Provisioning")
    print("=" * 60)

    if not email:
        try:
            email = input("Teacher Email Address: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            return False

    if not email or "@" not in email:
        print("[ERROR] A valid email address is required.")
        return False

    email = email.lower().strip()

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"[ERROR] User with email '{email}' already exists (Role: {existing.role}).")
            if existing.role != "teacher":
                print("To upgrade this account to teacher, use a database update or reset-password.")
            return False

        if not full_name:
            try:
                full_name = input("Teacher Full Name: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                return False

        if not full_name:
            full_name = "Instructor"

        if not password:
            try:
                password = getpass.getpass("Teacher Password (min 6 chars): ")
                confirm = getpass.getpass("Confirm Password: ")
                if password != confirm:
                    print("[ERROR] Passwords do not match.")
                    return False
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                return False

        if len(password) < 6:
            print("[ERROR] Password must be at least 6 characters.")
            return False

        new_teacher = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            role="teacher",
            is_active=True
        )
        db.add(new_teacher)
        db.commit()
        db.refresh(new_teacher)

        # Audit log
        db.add(AuditLog(
            actor_user_id=new_teacher.id,
            action="TEACHER_INITIALIZED_CLI",
            target_resource=new_teacher.id,
            details={"email": email, "full_name": full_name}
        ))
        db.commit()

        print(f"\n[SUCCESS] Teacher account created successfully!")
        print(f"  • ID    : {new_teacher.id}")
        print(f"  • Email : {new_teacher.email}")
        print(f"  • Name  : {new_teacher.full_name}")
        print(f"  • Role  : {new_teacher.role}")
        return True
    finally:
        db.close()


def reset_password(email: str = None, new_password: str = None):
    print("=" * 60)
    print("SATARK — Local Account Password Reset")
    print("=" * 60)

    if not email:
        try:
            email = input("User Email Address: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            return False

    email = email.lower().strip()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"[ERROR] User with email '{email}' not found.")
            return False

        if not new_password:
            try:
                new_password = getpass.getpass("New Password (min 6 chars): ")
                confirm = getpass.getpass("Confirm Password: ")
                if new_password != confirm:
                    print("[ERROR] Passwords do not match.")
                    return False
            except (KeyboardInterrupt, EOFError):
                print("\nAborted.")
                return False

        if len(new_password) < 6:
            print("[ERROR] Password must be at least 6 characters.")
            return False

        user.hashed_password = hash_password(new_password)
        db.commit()

        db.add(AuditLog(
            actor_user_id=user.id,
            action="PASSWORD_RESET_CLI",
            target_resource=user.id,
            details={"email": email}
        ))
        db.commit()

        print(f"[SUCCESS] Password for {email} ({user.role}) has been reset successfully.")
        return True
    finally:
        db.close()


def backup_database():
    source = DEFAULT_SQLITE_PATH
    if not source.exists():
        print(f"[ERROR] Database file not found at {source}")
        return False

    backup_dir = source.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = backup_dir / f"satark_{timestamp}.db"
    shutil.copy2(source, dest)
    print(f"[SUCCESS] Database backed up to: {dest}")
    return True


def db_status():
    import sqlite3
    db_path = Path(DEFAULT_SQLITE_PATH)
    if not db_path.exists():
        print("NOT_FOUND 0")
        return False
    try:
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        jm = cur.execute("PRAGMA journal_mode;").fetchone()[0]
        tables = len(cur.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall())
        conn.close()
        print(f"{jm} {tables}")
        return True
    except Exception as e:
        print(f"ERROR {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="SATARK Local Administration CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # create-teacher
    ct = subparsers.add_parser("create-teacher", help="Create a local teacher administrator account")
    ct.add_argument("--email", type=str, help="Teacher email address")
    ct.add_argument("--name", type=str, help="Teacher full name")
    ct.add_argument("--password", type=str, help="Teacher account password")

    # reset-password
    rp = subparsers.add_parser("reset-password", help="Reset password for an existing account")
    rp.add_argument("--email", type=str, required=True, help="User email address")
    rp.add_argument("--password", type=str, help="New password")

    # backup-db
    subparsers.add_parser("backup-db", help="Create a timestamped backup of the local database")

    # init-db
    subparsers.add_parser("init-db", help="Initialize local SQLite schema and views")

    # db-status
    subparsers.add_parser("db-status", help="Print journal mode and table count of local database")

    args = parser.parse_args()

    if args.command == "create-teacher":
        ok = create_teacher(args.email, args.name, args.password)
        sys.exit(0 if ok else 1)
    elif args.command == "reset-password":
        ok = reset_password(args.email, args.password)
        sys.exit(0 if ok else 1)
    elif args.command == "backup-db":
        ok = backup_database()
        sys.exit(0 if ok else 1)
    elif args.command == "init-db":
        run_init_db()
        print("[SUCCESS] Database schema initialized.")
        sys.exit(0)
    elif args.command == "db-status":
        ok = db_status()
        sys.exit(0 if ok else 1)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
