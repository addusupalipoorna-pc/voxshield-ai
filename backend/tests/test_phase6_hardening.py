"""
Phase 6 — Production Hardening, Security, Reliability & SIH Test Suite.

Verifies:
1. Centralized Security Policy Engine (Pure invariant evaluation)
2. Command Parameter Sanitizer & Metacharacter Blocker (Shell injection, Path traversal)
3. Dynamic Phrase Liveness Challenge (TTL, single-use, transcript verification)
4. Correlation ID Tracking (VX-2026-XXXXXX format across transactions)
5. 8 Full Attack Scenarios:
   - Scenario 1: Unknown speaker blocked (Speaker identification mismatch)
   - Scenario 2: Acoustic replay attack detected and blocked
   - Scenario 3: Synthetic / deepfake voice blocked
   - Scenario 4: High-risk command gated behind email approval + OTP + laptop CONTINUE
   - Scenario 5: Command continued on wrong / untrusted laptop blocked
   - Scenario 6: Expired command cannot be continued
   - Scenario 7: Inactive / revoked device cannot continue
   - Scenario 8: Shell injection in parameters detected and rejected
6. Honest Model Reporting (GET /api/v1/health/model-status)
"""
import io
import re
import wave
import json
import pytest
from datetime import datetime, timezone, timedelta

from app.models.command import CommandRisk, CommandStatus, VoiceCommand
from app.models.trusted_device import TrustedDevice
from app.models.user import User
from app.services.security_policy_engine import (
    evaluate_security_policy,
    PolicyVerdict,
    SecurityStatus,
)
from app.services.command_validator import (
    validate_command_parameters,
    validate_file_path,
    validate_url,
    sanitize_text,
)
from app.services.liveness_service import (
    generate_liveness_challenge,
    verify_liveness_challenge,
)
from app.services.correlation import generate_correlation_id, is_valid_correlation_id


# ─── Unit Tests: Correlation ID ──────────────────────────────────────────────

def test_correlation_id_format():
    cid = generate_correlation_id()
    assert is_valid_correlation_id(cid)
    assert cid.startswith("VX-2026-")
    assert len(cid) == 14
    assert re.match(r"^VX-2026-[A-F0-9]{6}$", cid)


# ─── Unit Tests: Command Parameter Sanitizer & Protection ───────────────────

def test_parameter_sanitizer_blocks_shell_injection():
    # Semicolon injection
    valid, err, sanitized = validate_command_parameters(
        "OPEN_CHROME", {"url": "https://google.com; rm -rf /"}
    )
    assert not valid
    assert "illegal" in err.lower() or "characters" in err.lower()

    # Backtick injection
    valid, err, sanitized = validate_command_parameters(
        "OPEN_FILE", {"path": "document.txt; `whoami`"}
    )
    assert not valid

    # Pipe operator injection
    valid, err, sanitized = validate_command_parameters(
        "SEND_MESSAGE", {"recipient": "Alice | bash -i", "message": "hello"}
    )
    assert not valid or "|" not in sanitized.get("recipient", "")


def test_parameter_sanitizer_blocks_path_traversal():
    valid, err, sanitized = validate_command_parameters(
        "OPEN_FILE", {"path": "../../etc/shadow"}
    )
    assert not valid
    assert "traversal" in err.lower()

    valid, err, sanitized = validate_command_parameters(
        "OPEN_FILE", {"path": "/etc/passwd"}
    )
    assert not valid
    assert "system folder" in err.lower() or "blocked" in err.lower()


def test_parameter_sanitizer_allows_benign_inputs():
    valid, err, sanitized = validate_command_parameters(
        "OPEN_CHROME", {"url": "https://en.wikipedia.org/wiki/Main_Page"}
    )
    assert valid
    assert sanitized["url"] == "https://en.wikipedia.org/wiki/Main_Page"

    valid, err, sanitized = validate_command_parameters(
        "SEND_EMAIL", {"recipient": "officer@voxshield.ai", "message": "Status report confirmed"}
    )
    assert valid
    assert sanitized["recipient"] == "officer@voxshield.ai"


# ─── Unit Tests: Dynamic Liveness Challenge ─────────────────────────────────

def test_dynamic_liveness_challenge_lifecycle():
    challenge = generate_liveness_challenge()
    assert challenge.challenge_id
    assert len(challenge.phrase) > 5

    # Verification with exact expected phrase
    verified, msg = verify_liveness_challenge(challenge.challenge_id, challenge.phrase)
    assert verified
    assert "verified" in msg.lower()

    # Single-use enforcement: second verification must fail
    verified_again, msg_again = verify_liveness_challenge(challenge.challenge_id, challenge.phrase)
    assert not verified_again
    assert "already been used" in msg_again.lower()


def test_dynamic_liveness_challenge_mismatch():
    challenge = generate_liveness_challenge()
    verified, msg = verify_liveness_challenge(
        challenge.challenge_id, "completely unrelated random text here"
    )
    assert not verified
    assert "mismatch" in msg.lower()


# ─── Unit Tests: Centralized Security Policy Engine ─────────────────────────

def test_scenario_1_unknown_speaker_blocked():
    """Scenario 1: Voice impersonation with unverified / unknown speaker."""
    decision = evaluate_security_policy(
        is_known_speaker=False,
        speaker_similarity=0.35,
        speaker_label="UNKNOWN",
        command_intent="OPEN_FILE",
        command_risk="LOW",
    )
    assert decision.verdict == PolicyVerdict.BLOCK
    assert decision.initial_status == SecurityStatus.BLOCKED
    assert decision.is_blocked
    assert any("speaker" in r.lower() for r in decision.reasons)


def test_scenario_2_replay_attack_blocked():
    """Scenario 2: Acoustic replay attack detected."""
    decision = evaluate_security_policy(
        replay_prob=0.88,
        replay_label="REPLAY_DETECTED",
        is_known_speaker=True,
        speaker_similarity=0.92,
        command_intent="OPEN_BROWSER",
        command_risk="LOW",
    )
    assert decision.verdict == PolicyVerdict.BLOCK
    assert decision.initial_status == SecurityStatus.BLOCKED
    assert decision.is_blocked
    assert any("replay" in r.lower() for r in decision.reasons)


def test_scenario_3_synthetic_deepfake_blocked():
    """Scenario 3: Synthetic / AI voice clone detected."""
    decision = evaluate_security_policy(
        synthetic_prob=0.91,
        deepfake_label="SYNTHETIC",
        is_known_speaker=True,
        speaker_similarity=0.88,
        command_intent="LOCK_WORKSTATION",
        command_risk="LOW",
    )
    assert decision.verdict == PolicyVerdict.BLOCK
    assert decision.initial_status == SecurityStatus.BLOCKED
    assert decision.is_blocked
    assert any("synthetic" in r.lower() for r in decision.reasons)


def test_scenario_4_high_risk_command_requires_escalation():
    """Scenario 4: High-risk command requires email approval + OTP + laptop CONTINUE."""
    decision = evaluate_security_policy(
        synthetic_prob=0.05,
        deepfake_label="AUTHENTIC",
        replay_prob=0.02,
        replay_label="CLEAR",
        is_known_speaker=True,
        speaker_similarity=0.95,
        command_intent="SHUTDOWN_PC",
        command_risk="CRITICAL",
        command_requires_approval=True,
    )
    assert decision.verdict == PolicyVerdict.REQUIRE_APPROVAL
    assert decision.initial_status == SecurityStatus.APPROVAL_REQUIRED
    assert decision.requires_email_approval
    assert decision.requires_otp
    assert decision.requires_laptop_continue


def test_benign_low_risk_command_awaits_continue():
    """Core Principle: Authentic voice still requires laptop CONTINUE."""
    decision = evaluate_security_policy(
        synthetic_prob=0.02,
        deepfake_label="AUTHENTIC",
        replay_prob=0.01,
        replay_label="CLEAR",
        is_known_speaker=True,
        speaker_similarity=0.96,
        command_intent="OPEN_CHROME",
        command_risk="LOW",
        command_requires_approval=False,
    )
    assert decision.verdict == PolicyVerdict.ALLOW
    assert decision.initial_status == SecurityStatus.WAITING_FOR_CONTINUE
    assert decision.requires_laptop_continue


# ─── Integration API Tests: Device Invariants & Transitions ──────────────────

def test_scenario_5_command_on_wrong_device_blocked(client, db_session, test_user, user_auth_headers):
    """Scenario 5: Execution attempt bound to Device A cannot be continued on Device B."""
    now = datetime.now(timezone.utc)
    
    # Device A
    device_a = TrustedDevice(
        user_id=test_user.id,
        name="Laptop-Alpha",
        device_fingerprint="fp-alpha-123",
        is_active=True,
        last_seen_at=now,
    )
    # Device B
    device_b = TrustedDevice(
        user_id=test_user.id,
        name="Laptop-Beta",
        device_fingerprint="fp-beta-456",
        is_active=True,
        last_seen_at=now,
    )
    db_session.add_all([device_a, device_b])
    db_session.commit()

    # Command bound specifically to Device A
    cmd = VoiceCommand(
        user_id=test_user.id,
        device_id=device_a.id,
        device_name=device_a.name,
        intent="OPEN_CHROME",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
        raw_transcript="open chrome",
        expires_at=now + timedelta(minutes=10),
    )
    db_session.add(cmd)
    db_session.commit()

    # Attempt to continue from Agent B with agent auth
    from app.config import get_settings
    res = client.post(
        f"/api/v1/agent/commands/{cmd.id}/continue",
        headers={
            "Authorization": f"Bearer {get_settings().agent_api_token}",
            "X-Device-Id": device_b.id,
        },
    )
    assert res.status_code == 403
    assert "device mismatch" in res.json()["detail"].lower()


def test_scenario_6_expired_command_cannot_continue(client, db_session, test_user, user_auth_headers):
    """Scenario 6: Expired command rejected by backend."""
    past = datetime.now(timezone.utc) - timedelta(minutes=20)
    cmd = VoiceCommand(
        user_id=test_user.id,
        intent="OPEN_CALCULATOR",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
        raw_transcript="open calculator",
        expires_at=past,
    )
    db_session.add(cmd)
    db_session.commit()

    res = client.post(
        f"/api/v1/commands/{cmd.id}/continue",
        headers=user_auth_headers,
    )
    assert res.status_code == 410
    assert "expired" in res.json()["detail"].lower()


def test_scenario_7_revoked_device_cannot_continue(client, db_session, test_user, user_auth_headers):
    """Scenario 7: Inactive / revoked workstation rejected."""
    now = datetime.now(timezone.utc)
    revoked_device = TrustedDevice(
        user_id=test_user.id,
        name="Compromised-Laptop",
        device_fingerprint="fp-compromised",
        is_active=False,  # Revoked
        last_seen_at=now,
    )
    db_session.add(revoked_device)
    db_session.commit()

    cmd = VoiceCommand(
        user_id=test_user.id,
        device_id=revoked_device.id,
        intent="OPEN_CHROME",
        risk=CommandRisk.LOW,
        status=CommandStatus.WAITING_FOR_CONTINUE,
        raw_transcript="open chrome",
        expires_at=now + timedelta(minutes=10),
    )
    db_session.add(cmd)
    db_session.commit()

    res = client.post(
        f"/api/v1/commands/{cmd.id}/continue",
        headers=user_auth_headers,
    )
    assert res.status_code == 400
    assert "inactive or revoked" in res.json()["detail"].lower()


def test_scenario_8_malicious_shell_injection_command(client, db_session, test_user, user_auth_headers):
    """Scenario 8: Process command with arbitrary shell metacharacters in parameters."""
    import math
    import struct
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        samples = [struct.pack("<h", int(10000 * math.sin(2 * math.pi * 440 * (i / 16000)))) for i in range(16000)]
        wf.writeframes(b"".join(samples))
    wav_bytes = wav_io.getvalue()

    # Malicious injection in transcript
    res = client.post(
        "/api/v1/voice/process-command",
        headers=user_auth_headers,
        files={"audio": ("sample.wav", wav_bytes, "audio/wav")},
        data={"transcript": "open file ../../etc/shadow ; rm -rf /"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["correlation_id"].startswith("VX-2026-")
    # Command parameter check rejected path traversal and shell characters
    assert not data["command"]["is_allowed"] or data["command"]["status"] == "BLOCKED"


def test_model_status_endpoint(client):
    """Verifies honest reporting of AI / DSP / Heuristic model subsystems."""
    res = client.get("/api/v1/health/model-status")
    assert res.status_code == 200
    data = res.json()
    assert "services" in data
    keys = {s["key"] for s in data["services"]}
    assert "speaker_verification" in keys
    assert "deepfake_detector" in keys
    assert "replay_detector" in keys
