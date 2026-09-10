"""
Tests for Authentication: Registration, Login, Token Refresh, Password Reset, Email Verification.
"""
import pytest
from app.models.user import UserRole


def test_register_success(client):
    payload = {
        "name": "Alice Doe",
        "email": "alice@example.com",
        "phone": "+1 555-1234",
        "password": "SecurePassword123!",
        "consent": True,
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code in (200, 201)
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["name"] == "Alice Doe"
    assert data["user"]["role"] == UserRole.USER.value


def test_register_duplicate_email(client):
    payload = {
        "name": "Bob Duplicate",
        "email": "bob@example.com",
        "password": "SecurePassword123!",
        "consent": True,
    }
    res1 = client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code in (200, 201)

    # Second registration should fail with 400
    res2 = client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"].lower()


def test_register_missing_consent(client):
    payload = {
        "name": "No Consent",
        "email": "noconsent@example.com",
        "password": "SecurePassword123!",
        "consent": False,
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 400
    assert "consent" in res.json()["detail"].lower()


def test_login_success(client, test_user):
    res = client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Password123!",
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["id"] == test_user.id


def test_login_wrong_password(client, test_user):
    res = client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "WrongPassword!",
    })
    assert res.status_code == 401
    assert "invalid" in res.json()["detail"].lower()


def test_get_me(client, user_auth_headers, test_user):
    res = client.get("/api/v1/auth/me", headers=user_auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == test_user.email
    assert data["role"] == UserRole.USER.value


def test_forgot_password(client, test_user):
    res = client.post("/api/v1/auth/forgot-password", json={
        "email": test_user.email,
    })
    assert res.status_code == 200
    assert "message" in res.json()
