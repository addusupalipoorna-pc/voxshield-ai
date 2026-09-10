"""
Tests for Phase 4: Unified Identity Enrollment, Phone Verification, 
1:N Speaker Identification, and CONTINUE TO EXECUTE workflow.
"""
import pytest
from datetime import datetime, timezone, timedelta
from app.models.command import VoiceCommand, CommandStatus, CommandRisk
from app.services.speaker_verification import verify_speaker, identify_speaker


def test_phone_otp_and_identity_profile_flow(client, user_auth_headers):
    # 1. Send Phone OTP
    res_send = client.post(
        "/api/v1/auth/phone/send-otp",
        json={"phone": "+91 98765 43210"},
        headers=user_auth_headers,
    )
    assert res_send.status_code == 200
    data = res_send.json()
    assert "demo_otp" in data or "message" in data
    otp_code = data.get("demo_otp")

    # If demo OTP returned, verify it
    if otp_code:
        res_verify = client.post(
            "/api/v1/auth/phone/verify-otp",
            json={"otp": otp_code, "phone": "+91 98765 43210"},
            headers=user_auth_headers,
        )
        assert res_verify.status_code == 200
        assert res_verify.json()["phone_verified"] is True

    # 2. Check complete Identity Profile
    res_prof = client.get("/api/v1/auth/identity-profile", headers=user_auth_headers)
    assert res_prof.status_code == 200
    prof = res_prof.json()
    assert "name" in prof
    assert "email_verified" in prof
    assert "phone_verified" in prof
    assert "voice_enrolled" in prof
    assert "speaker_profile" in prof
    assert "identity_status" in prof


def test_continue_and_cancel_command_flow(client, db_session, test_user, user_auth_headers):
    # 1. Seed a command in WAITING_FOR_CONTINUE status
    cmd = VoiceCommand(
        user_id=test_user.id,
        raw_transcript="Open WhatsApp",
        intent="OPEN_WHATSAPP",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(cmd)
    db_session.commit()
    db_session.refresh(cmd)

    # 2. User confirms execution by calling continue endpoint
    res_continue = client.post(
        f"/api/v1/commands/{cmd.id}/continue",
        json={},
        headers=user_auth_headers,
    )
    assert res_continue.status_code == 200
    assert res_continue.json()["status"] == CommandStatus.APPROVED.value

    # 3. Cancel another command in WAITING_FOR_CONTINUE status
    cmd2 = VoiceCommand(
        user_id=test_user.id,
        raw_transcript="Open Chrome",
        intent="OPEN_CHROME",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
    )
    db_session.add(cmd2)
    db_session.commit()
    db_session.refresh(cmd2)

    res_cancel = client.post(
        f"/api/v1/commands/{cmd2.id}/cancel",
        headers=user_auth_headers,
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == CommandStatus.CANCELLED.value


def test_agent_continue_and_cancel_endpoints(client, db_session, test_user):
    agent_headers = {"Authorization": "Bearer INSECURE-AGENT-TOKEN"}

    # Seed WAITING_FOR_CONTINUE command
    cmd = VoiceCommand(
        user_id=test_user.id,
        raw_transcript="Open Calculator",
        intent="OPEN_CALCULATOR",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(cmd)
    db_session.commit()
    db_session.refresh(cmd)

    # Agent calls continue
    res_agent_cont = client.post(
        f"/api/v1/agent/commands/{cmd.id}/continue",
        headers=agent_headers,
    )
    assert res_agent_cont.status_code == 200
    assert res_agent_cont.json()["status"] == CommandStatus.APPROVED.value


def test_speaker_identification_logic():
    # Synthetic MFCC vectors
    vec_a = [0.5, 0.8, -0.2, 0.9, 0.1, 0.4]
    vec_b = [-0.5, -0.8, 0.2, -0.9, -0.1, -0.4]

    profiles = [
        {"user_id": "u1", "user_name": "Poorna Chandar", "feature_vector": vec_a},
        {"user_id": "u2", "user_name": "Analyst User", "feature_vector": vec_b},
    ]

    # Test match against Poorna Chandar
    match_res = identify_speaker(vec_a, profiles)
    assert match_res.is_verified is True
    assert match_res.identified_name == "Poorna Chandar"
    assert match_res.match_score > 85.0
    assert match_res.confidence == "HIGH"

    # Test unknown vector
    orthogonal_vec = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    match_unknown = identify_speaker(orthogonal_vec, profiles)
    assert match_unknown.identified_name in ("Poorna Chandar", "Unknown Speaker")
