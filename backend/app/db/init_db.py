"""
Database initialisation — creates all tables and seeds default users for dev/testing.
Production uses Alembic migrations (`alembic upgrade head`).
"""
import logging
from datetime import datetime, timezone
from app.db.base import Base, engine, SessionLocal
import app.db.models_registry  # noqa: F401 — ensure all models are registered
from app.models.user import User, UserRole
from app.security.hashing import hash_password

logger = logging.getLogger(__name__)


def _sync_sqlite_columns() -> None:
    """Ensure newly added model columns exist in SQLite database tables."""
    try:
        with engine.connect() as conn:
            for table_name, table in Base.metadata.tables.items():
                existing_cols = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()}
                if not existing_cols:
                    continue
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(engine.dialect)
                        logger.info("Migrating SQLite schema: adding %s (%s) to %s", col.name, col_type, table_name)
                        conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}")
            conn.commit()
    except Exception as exc:
        logger.warning("SQLite schema column sync warning: %s", exc)


def init_db() -> None:
    """Create all tables and seed default users if empty (dev mode only)."""
    logger.info("Initialising database tables...")
    Base.metadata.create_all(bind=engine)
    _sync_sqlite_columns()
    logger.info("Database tables ready.")

    db = SessionLocal()
    try:
        if db.query(User).first() is None:
            logger.info("Seeding initial users for development...")
            users = [
                User(
                    name="Security Administrator",
                    email="admin@voxshield.ai",
                    phone="+1-555-0100",
                    hashed_password=hash_password("Admin@123"),
                    role=UserRole.ADMIN,
                    is_active=True,
                    consent_given=True,
                    consent_at=datetime.now(timezone.utc),
                ),
                User(
                    name="Security Analyst",
                    email="analyst@voxshield.ai",
                    phone="+1-555-0101",
                    hashed_password=hash_password("Analyst@123"),
                    role=UserRole.SECURITY_ANALYST,
                    is_active=True,
                    consent_given=True,
                    consent_at=datetime.now(timezone.utc),
                ),
                User(
                    name="Demo Operator",
                    email="operator@voxshield.ai",
                    phone="+1-555-0102",
                    hashed_password=hash_password("Operator@123"),
                    role=UserRole.USER,
                    is_active=True,
                    consent_given=True,
                    consent_at=datetime.now(timezone.utc),
                ),
            ]
            db.add_all(users)
            db.commit()
            logger.info("Seeded 3 default development accounts.")
    except Exception as exc:
        db.rollback()
        logger.warning("Error seeding initial users: %s", exc)
    finally:
        db.close()
