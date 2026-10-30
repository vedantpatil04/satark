from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.app.core.config import settings

# Database connection settings & dialect normalization
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {}
pool_kwargs = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Supabase PostgreSQL Pooler resilience
    pool_kwargs = {
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_recycle": 300
    }

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,
    **pool_kwargs
)

# Enable SQLite foreign key constraints
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
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
    # Import all models to register with Base.metadata
    import backend.app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)

