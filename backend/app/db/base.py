"""
SQLAlchemy engine and session factory.
Supports both PostgreSQL (production) and SQLite (dev fallback).
"""
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings

settings = get_settings()

# SQLite needs check_same_thread=False; Postgres doesn't need it
connect_args = {"check_same_thread": False} if settings.using_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,  # detect stale connections
    echo=settings.is_development,
)

# Enable WAL mode for SQLite (better concurrent read performance)
if settings.using_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _conn_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    """Returns True if the database is reachable."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
