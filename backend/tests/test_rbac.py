"""
Tests for Role-Based Access Control (RBAC):
ADMIN vs SECURITY_ANALYST vs USER permissions on administrative and analyst endpoints.
"""
import pytest
from app.models.user import UserRole


def test_admin_users_endpoint_as_admin(client, admin_auth_headers):
    res = client.get("/api/v1/admin/users", headers=admin_auth_headers)
    assert res.status_code == 200
    assert "users" in res.json()


def test_admin_users_endpoint_as_analyst(client, analyst_auth_headers):
    res = client.get("/api/v1/admin/users", headers=analyst_auth_headers)
    assert res.status_code == 403


def test_admin_users_endpoint_as_user(client, user_auth_headers):
    res = client.get("/api/v1/admin/users", headers=user_auth_headers)
    assert res.status_code == 403


def test_admin_users_endpoint_unauthorized(client):
    res = client.get("/api/v1/admin/users")
    assert res.status_code == 401


def test_audit_logs_as_admin(client, admin_auth_headers):
    res = client.get("/api/v1/audit-logs", headers=admin_auth_headers)
    assert res.status_code == 200
    assert "audit_logs" in res.json()


def test_audit_logs_as_analyst(client, analyst_auth_headers):
    res = client.get("/api/v1/audit-logs", headers=analyst_auth_headers)
    assert res.status_code == 200  # Analysts have audit log view permission


def test_audit_logs_as_user(client, user_auth_headers):
    res = client.get("/api/v1/audit-logs", headers=user_auth_headers)
    assert res.status_code == 403
