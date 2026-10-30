import os
from pathlib import Path
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.app.core.config import settings

# Determine workspace root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEFAULT_SQLITE_PATH = PROJECT_ROOT / "data" / "satark.db"

# Normalize database URL
db_url = settings.DATABASE_URL or f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"

if db_url.startswith("sqlite"):
    # If using relative sqlite path, anchor to project root data directory
    if "satark.db" in db_url or "smart_classroom.db" in db_url:
        db_url = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
    connect_args = {"check_same_thread": False, "timeout": 15}
    pool_kwargs = {}
elif db_url.startswith("postgresql"):
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    connect_args = {}
    pool_kwargs = {
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 300
    }
else:
    connect_args = {}
    pool_kwargs = {}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,
    **pool_kwargs
)

# Enable SQLite foreign key constraints, WAL mode, and busy timeout
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if db_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Ensure data directory exists
    DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
    
    # Import all models to register with Base.metadata
    import backend.app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # If SQLite, ensure compatibility view 'profiles' exists mapping to 'users'
    if db_url.startswith("sqlite"):
        with engine.begin() as conn:
            conn.execute(text("CREATE VIEW IF NOT EXISTS profiles AS SELECT * FROM users;"))
