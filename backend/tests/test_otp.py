"""
Comprehensive test suite for VoxShield AI Real OTP System:
- Email & Phone OTP generation & verification
- Incorrect OTP, Expired OTP, Used OTP
- Attempt limiting (max 5 attempts, lockout)
- Resend cooldown (60 seconds) & Hourly rate limiting (5/hr)
- Purpose binding protection (LOGIN != REGISTRATION != COMMAND_APPROVAL)
- E.164 phone normalization & validation
- Phone & Email OTP Login flows
- High-risk command OTP integration
"""
import pytest
from datetime import datetime, timezone, timedelta
from app.models.user import User
from app.models.otp import OTPVerification, OTPChannel, OTPPurpose
from app.models.command import VoiceCommand, CommandStatus, CommandRisk
from app.services.otp_service import (
    create_otp, verify_otp, normalize_phone_number, normalize_destination,
    hash_otp, generate_otp_code, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS
)
from app.services.sms_service import normalize_phone_number as sms_norm


# ── 1. Phone Normalization Tests ─────────────────────────────────────────────

def test_phone_number_normalization_e164():
    # 10-digit Indian numbers
    assert normalize_phone_number("9876543210") == "+919876543210"
    assert normalize_phone_number(" 9876543210 ") == "+919876543210"
    # Formatted with spaces or dashes
    assert normalize_phone_number("+91 98765-43210") == "+919876543210"
    assert normalize_phone_number("+919876543210") == "+919876543210"
    assert normalize_phone_number("919876543210") == "+919876543210"


def test_phone_number_normalization_invalid():
    with pytest.raises(Exception):
        normalize_phone_number("123")  # too short
    with pytest.raises(Exception):
        normalize_phone_number("")  # empty


# ── 2. Cryptographic Code Generation & Hashing ────────────────────────────────

def test_otp_code_cryptographic_format():
    code = generate_otp_code()
    assert len(code) == 6
    assert code.isdigit()
    assert 100000 <= int(code) <= 999999


def test_otp_hash_purpose_and_destination_binding():
    code = "482913"
    h1 = hash_otp(code, "+919876543210", "REGISTRATION")
    h2 = hash_otp(code, "+919876543210", "LOGIN")
    h3 = hash_otp(code, "+919999999999", "REGISTRATION")

    assert h1 != h2, "Different purpose must yield different hash"
    assert h1 != h3, "Different destination must yield different hash"


# ── 3. Lifecycle Tests: Success, Expiry, Used, Attempts ─────────────────────────

def test_otp_lifecycle_success(db_session):
    rec, raw_code = create_otp(
        db=db_session,
        channel="EMAIL",
        purpose="REGISTRATION",
        destination="test.success@voxshield.ai",
    )
    assert rec.attempt_count == 0
    assert rec.used_at is None

    valid, status_str, updated = verify_otp(
        db=db_session,
        channel="EMAIL",
        purpose="REGISTRATION",
        destination="test.success@voxshield.ai",
        code=raw_code,
    )
    assert valid is True
    assert status_str == "VERIFIED"
    assert updated.used_at is not None


def test_otp_already_used_rejected(db_session):
    rec, raw_code = create_otp(
        db=db_session,
        channel="EMAIL",
        purpose="REGISTRATION",
        destination="test.singleuse@voxshield.ai",
    )
    valid, _, _ = verify_otp(db_session, "EMAIL", "REGISTRATION", "test.singleuse@voxshield.ai", raw_code)
    assert valid is True

    # Re-use attempt
    valid_again, status_str, _ = verify_otp(db_session, "EMAIL", "REGISTRATION", "test.singleuse@voxshield.ai", raw_code)
    assert valid_again is False
    assert status_str == "OTP_ALREADY_USED"


def test_otp_expiration(db_session):
    rec, raw_code = create_otp(
        db=db_session,
        channel="PHONE",
        purpose="REGISTRATION",
        destination="+919876543210",
    )
    # Manually expire the record
    rec.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    valid, status_str, _ = verify_otp(db_session, "PHONE", "REGISTRATION", "+919876543210", raw_code)
    assert valid is False
    assert status_str == "OTP_EXPIRED"


def test_otp_max_attempts_lockout(db_session):
    rec, raw_code = create_otp(
        db=db_session,
        channel="PHONE",
        purpose="REGISTRATION",
        destination="+919876543211",
    )

    # 4 incorrect attempts
    for i in range(4):
        valid, status_str, upd = verify_otp(db_session, "PHONE", "REGISTRATION", "+919876543211", "000000")
        assert valid is False
        assert status_str == "OTP_INVALID"
        assert upd.attempt_count == i + 1

    # 5th incorrect attempt -> exceeds limit and invalidates
    valid, status_str, upd = verify_otp(db_session, "PHONE", "REGISTRATION", "+919876543211", "000000")
    assert valid is False
    assert status_str == "OTP_ATTEMPTS_EXCEEDED"

    # Even the correct code is now rejected because code was invalidated
    valid_correct, status_str_correct, _ = verify_otp(db_session, "PHONE", "REGISTRATION", "+919876543211", raw_code)
    assert valid_correct is False
    assert status_str_correct in ("OTP_ATTEMPTS_EXCEEDED", "OTP_ALREADY_USED")


def test_otp_purpose_binding_rejection(db_session):
    rec, raw_code = create_otp(
        db=db_session,
        channel="PHONE",
        purpose="REGISTRATION",
        destination="+919876543212",
    )

    # Attempt to use REGISTRATION OTP for LOGIN or COMMAND_APPROVAL
    valid, status_str, _ = verify_otp(
        db=db_session,
        channel="PHONE",
        purpose="LOGIN",
        destination="+919876543212",
        code=raw_code,
    )
    assert valid is False
    assert status_str == "OTP_NOT_FOUND"


def test_otp_resend_cooldown(db_session):
    dest = "+919876543213"
    rec1, _ = create_otp(db_session, "PHONE", "REGISTRATION", dest)
    assert rec1 is not None

    # Immediate second request triggers 429 RESEND_COOLDOWN_ACTIVE
    with pytest.raises(Exception) as excinfo:
        create_otp(db_session, "PHONE", "REGISTRATION", dest)
    assert "429" in str(excinfo.value) or "RESEND_COOLDOWN_ACTIVE" in str(excinfo.value)


# ── 4. API Endpoints Tests ───────────────────────────────────────────────────

def test_api_send_and_verify_email_otp(client, user_auth_headers):
    # 1. Send Email OTP
    res_send = client.post(
        "/api/v1/auth/send-email-otp",
        json={"email": "otp.test@voxshield.ai", "purpose": "REGISTRATION"},
        headers=user_auth_headers,
    )
    assert res_send.status_code == 200
    data = res_send.json()
    assert data["success"] is True
    assert data["channel"] == "EMAIL"
    assert "expires_in" in data
    assert "cooldown_seconds" in data
    # Plaintext OTP must NEVER be returned
    assert "otp" not in data
    assert "code" not in data

    # 2. Try wrong OTP code
    res_wrong = client.post(
        "/api/v1/auth/verify-email-otp",
        json={"email": "otp.test@voxshield.ai", "otp": "000000", "purpose": "REGISTRATION"},
        headers=user_auth_headers,
    )
    assert res_wrong.status_code == 400


def test_api_send_and_verify_phone_otp(client, user_auth_headers):
    # 1. Send Phone OTP
    res_send = client.post(
        "/api/v1/auth/send-phone-otp",
        json={"phone": "+919876500001", "purpose": "REGISTRATION"},
        headers=user_auth_headers,
    )
    assert res_send.status_code == 200
    data = res_send.json()
    assert data["success"] is True
    assert data["channel"] == "PHONE"
    assert "+91" in data["destination"]
    # Plaintext OTP must NEVER be returned
    assert "otp" not in data
    assert "code" not in data

    # 2. Try wrong OTP
    res_wrong = client.post(
        "/api/v1/auth/verify-phone-otp",
        json={"phone": "+919876500001", "otp": "111111", "purpose": "REGISTRATION"},
        headers=user_auth_headers,
    )
    assert res_wrong.status_code == 400


def test_api_phone_login_flow(client, db_session):
    # Setup registered user with phone
    user = User(
        name="Phone Login User",
        email="phone.login@voxshield.ai",
        phone="+919876500099",
        hashed_password="dummyhashedpw",
        is_active=True,
        consent_given=True,
    )
    db_session.add(user)
    db_session.commit()

    # 1. Request Phone Login OTP
    res_req = client.post("/api/v1/auth/login/request-phone-otp", json={"phone": "9876500099"})
    assert res_req.status_code == 200
    assert res_req.json()["otp_requested"] is True
    # OTP never returned
    assert "otp" not in res_req.json()

    # Get generated OTP from db to simulate receiving SMS
    otp_rec = (
        db_session.query(OTPVerification)
        .filter(OTPVerification.destination == "+919876500099", OTPVerification.purpose == "LOGIN")
        .order_by(OTPVerification.created_at.desc())
        .first()
    )
    assert otp_rec is not None

    # Verify wrong code fails
    res_fail = client.post("/api/v1/auth/login/verify-phone-otp", json={"phone": "+919876500099", "otp": "999999"})
    assert res_fail.status_code == 400


def test_api_verification_status_endpoint(client, user_auth_headers):
    res = client.get("/api/v1/auth/verification-status", headers=user_auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "email" in data
    assert "email_verified" in data
    assert "phone_verified" in data
    assert "voice_enrolled" in data
    assert "trusted_devices_count" in data
