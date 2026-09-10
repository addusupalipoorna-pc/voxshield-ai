"""
Pytest configuration and shared test fixtures for VoxShield AI backend tests.
Uses an isolated SQLite test database with all models registered.
"""
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure test environment settings before importing app
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-jwt-secret-key-for-testing-only-12345"
os.environ["APPROVAL_SECRET"] = "test-approval-secret-key-for-testing-only-12345"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app.config import get_settings
get_settings.cache_clear()

from app.db.base import Base, get_db
import app.db.models_registry  # Ensure all models are registered with Base.metadata
from app.main import app
from app.models.user import User, UserRole
from app.security.hashing import hash_password
from app.security.jwt import create_access_token

TEST_SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session) -> User:
    user = User(
        name="Standard Operator",
        email="operator.test@voxshield.ai",
        hashed_password=hash_password("Password123!"),
        role=UserRole.USER,
        is_active=True,
        is_verified=True,
        consent_given=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_admin(db_session) -> User:
    admin = User(
        name="Security Admin",
        email="admin.test@voxshield.ai",
        hashed_password=hash_password("AdminSecure123!"),
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
        consent_given=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


@pytest.fixture
def test_analyst(db_session) -> User:
    analyst = User(
        name="Forensic Analyst",
        email="analyst.test@voxshield.ai",
        hashed_password=hash_password("AnalystSecure123!"),
        role=UserRole.SECURITY_ANALYST,
        is_active=True,
        is_verified=True,
        consent_given=True,
    )
    db_session.add(analyst)
    db_session.commit()
    db_session.refresh(analyst)
    return analyst


@pytest.fixture
def user_auth_headers(test_user) -> dict:
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_auth_headers(test_admin) -> dict:
    token = create_access_token(test_admin.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def analyst_auth_headers(test_analyst) -> dict:
    token = create_access_token(test_analyst.id)
    return {"Authorization": f"Bearer {token}"}
