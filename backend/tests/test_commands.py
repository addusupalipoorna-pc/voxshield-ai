"""
Tests for Voice Command interpretation, risk classification, and approval workflows.
"""
import pytest
from app.models.command import CommandRisk, CommandStatus


def test_interpret_safe_command(client, user_auth_headers):
    res = client.post("/api/v1/commands/interpret", json={
        "transcript": "Open WhatsApp please",
    }, headers=user_auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "OPEN_WHATSAPP"
    assert data["risk"] == "LOW"
    assert data["requires_approval"] is False
    assert data["is_allowed"] is True
    assert "command_id" in data


def test_interpret_high_risk_command(client, user_auth_headers):
    res = client.post("/api/v1/commands/interpret", json={
        "transcript": "Delete the confidential financial file",
    }, headers=user_auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["intent"] == "DELETE_FILE"
    assert data["risk"] in ("HIGH", "CRITICAL")
    assert data["requires_approval"] is True


def test_request_approval_flow(client, user_auth_headers):
    # First create a high-risk command
    int_res = client.post("/api/v1/commands/interpret", json={
        "transcript": "Send an urgent email to Ravi",
    }, headers=user_auth_headers)
    assert int_res.status_code == 200
    cmd_id = int_res.json()["command_id"]

    # Request approval
    appr_res = client.post("/api/v1/commands/request-approval", json={
        "command_id": cmd_id,
        "device_name": "Primary Laptop",
    }, headers=user_auth_headers)
    assert appr_res.status_code == 200
    data = appr_res.json()
    assert data["command_id"] == cmd_id
    assert "approval_id" in data
