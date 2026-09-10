"""
Tests for Trusted Devices & Laptop Agent API.
Verifies device registration, per-device token generation, command claiming, and execution acknowledgement.
"""
import pytest
from app.models.command import VoiceCommand, CommandStatus, CommandRisk


def test_device_registration_and_revocation(client, user_auth_headers):
    # 1. Register new device
    reg_res = client.post("/api/v1/devices/register", json={
        "name": "Test Laptop",
        "platform": "windows",
        "agent_version": "1.0.0",
    }, headers=user_auth_headers)
    assert reg_res.status_code in (200, 201)
    data = reg_res.json()
    assert "device_token" in data
    assert data["name"] == "Test Laptop"
    device_id = data["device_id"]

    # 2. List devices
    list_res = client.get("/api/v1/devices", headers=user_auth_headers)
    assert list_res.status_code == 200
    devices = list_res.json()["devices"]
    assert any(d["id"] == device_id for d in devices)

    # 3. Revoke device
    revoke_res = client.post(f"/api/v1/devices/{device_id}/revoke", headers=user_auth_headers)
    assert revoke_res.status_code == 200
    assert revoke_res.json()["device_id"] == device_id


def test_agent_pending_and_claim_flow(client, db_session, test_user):
    # Seed an APPROVED command in the database
    cmd = VoiceCommand(
        user_id=test_user.id,
        raw_transcript="Open WhatsApp",
        intent="OPEN_WHATSAPP",
        risk=CommandRisk.LOW,
        status=CommandStatus.APPROVED,
    )
    db_session.add(cmd)
    db_session.commit()
    db_session.refresh(cmd)

    # 1. Agent polls for pending commands with master dev token
    headers = {"Authorization": "Bearer INSECURE-AGENT-TOKEN"}
    pending_res = client.get("/api/v1/agent/pending", headers=headers)
    assert pending_res.status_code == 200
    commands = pending_res.json()["commands"]
    assert any(c["id"] == cmd.id for c in commands)

    # 2. Agent claims the command
    claim_res = client.post("/api/v1/agent/claim", json={"command_id": cmd.id}, headers=headers)
    assert claim_res.status_code == 200
    assert claim_res.json()["status"] == CommandStatus.CLAIMED.value

    # 3. Double-claim should be rejected with 400 Bad Request
    second_claim = client.post("/api/v1/agent/claim", json={"command_id": cmd.id}, headers=headers)
    assert second_claim.status_code == 400

    # 4. Agent acknowledges successful execution
    ack_res = client.post("/api/v1/agent/ack", json={
        "command_id": cmd.id,
        "success": True,
        "message": "WhatsApp Desktop opened",
    }, headers=headers)
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == CommandStatus.EXECUTED.value
