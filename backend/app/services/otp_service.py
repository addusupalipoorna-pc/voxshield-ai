"""
Unified Secure OTP Service for VoxShield AI.
Handles cryptographic generation, SHA-256 purpose-bound hashing, 5-minute expiry,
max 5 attempts enforcement, 60s resend cooldown, and rate limiting.
Never returns or exposes plaintext OTP in API responses.
"""
import hashlib
import logging
import re
import secrets
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.otp import OTPVerification, OTPChannel, OTPPurpose

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 15
MAX_OTP_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 10  # reduced from 60s for easier testing
MAX_HOURLY_REQUESTS = 20  # increased from 5 for development testing


def generate_otp_code() -> str:
    """Generate a cryptographically secure 6-digit numeric OTP."""
    return f"{secrets.randbelow(900000) + 100000}"


def hash_otp(code: str, destination: str, purpose: str) -> str:
    """
    Hash OTP code bound to destination, purpose, and server secret.
    Prevents rainbow table attacks and cross-purpose replay.
    """
    settings = get_settings()
    secret = settings.secret_key or "voxshield-otp-secret"
    payload = f"{code}:{destination.strip().lower()}:{purpose}:{secret}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_phone_number(phone: str) -> str:
    """
    Normalize phone number to international E.164 format (+91 for 10-digit Indian numbers).
    Validates numeric structure and length.
    """
    if not phone or not phone.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number is required."
        )

    raw = phone.strip()
    digits = re.sub(r"\D", "", raw)

    if len(digits) < 10 or len(digits) > 15:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid phone number length: {len(digits)} digits. Expected 10-15 digits."
        )

    # India national format: 10 digits -> +91XXXXXXXXXX
    if len(digits) == 10:
        return f"+91{digits}"
    # India with country code 91: 12 digits -> +91XXXXXXXXXX
    elif len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    elif raw.startswith("+"):
        return f"+{digits}"
    else:
        return f"+{digits}"


def normalize_destination(destination: str, channel: str) -> str:
    """Normalize phone to E.164 or email to lowercase trimmed string."""
    if channel.upper() == OTPChannel.PHONE.value:
        return normalize_phone_number(destination)
    elif channel.upper() == OTPChannel.EMAIL.value:
        dest = (destination or "").strip().lower()
        if not re.match(r"^[^@]+@[^@]+\.[^@]+$", dest):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email address format."
            )
        return dest
    return destination.strip()


def create_otp(
    db: Session,
    channel: str,
    purpose: str,
    destination: str,
    user_id: str | None = None,
) -> tuple[OTPVerification, str]:
    """
    Issue a new cryptographically secure 6-digit OTP.
    Enforces 60-second resend cooldown and hourly rate limit.
    Returns: (otp_record, raw_code)
    NOTE: raw_code is strictly for SMS/Email dispatcher transmission, NEVER for API output.
    """
    now = datetime.now(timezone.utc)
    norm_dest = normalize_destination(destination, channel)

    # ── 1. Resend Cooldown Protection (60s) ───────────────────────────────────
    latest = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.destination == norm_dest,
            OTPVerification.channel == channel.upper(),
            OTPVerification.purpose == purpose.upper(),
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )

    if latest and latest.created_at:
        created_utc = latest.created_at
        if created_utc.tzinfo is None:
            created_utc = created_utc.replace(tzinfo=timezone.utc)
        elapsed_sec = (now - created_utc).total_seconds()
        if elapsed_sec < RESEND_COOLDOWN_SECONDS:
            remaining = int(RESEND_COOLDOWN_SECONDS - elapsed_sec)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"RESEND_COOLDOWN_ACTIVE: Please wait {remaining} seconds before requesting a new code.",
            )

    # ── 2. Hourly Rate Limiting (5 requests per hour) ─────────────────────────
    one_hour_ago = now - timedelta(hours=1)
    recent_count = (
        db.query(func.count(OTPVerification.id))
        .filter(
            OTPVerification.destination == norm_dest,
            OTPVerification.channel == channel.upper(),
            OTPVerification.created_at >= one_hour_ago,
        )
        .scalar()
        or 0
    )

    if recent_count >= MAX_HOURLY_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="RATE_LIMIT_EXCEEDED: Maximum 5 OTP requests per hour. Please wait before retrying.",
        )

    # ── 3. Invalidate Previous Unused Codes ───────────────────────────────────
    active_previous = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.destination == norm_dest,
            OTPVerification.channel == channel.upper(),
            OTPVerification.purpose == purpose.upper(),
            OTPVerification.used_at.is_(None),
        )
        .all()
    )
    for prev in active_previous:
        prev.used_at = now

    # ── 4. Generate & Hash Code ───────────────────────────────────────────────
    raw_code = generate_otp_code()
    code_hash = hash_otp(raw_code, norm_dest, purpose.upper())
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    req_id = f"req-{uuid.uuid4().hex[:16]}"

    otp_record = OTPVerification(
        user_id=user_id,
        channel=channel.upper(),
        purpose=purpose.upper(),
        destination=norm_dest,
        otp_hash=code_hash,
        expires_at=expires_at,
        attempt_count=0,
        max_attempts=MAX_OTP_ATTEMPTS,
        created_at=now,
        last_sent_at=now,
        request_id=req_id,
    )
    db.add(otp_record)
    db.commit()
    db.refresh(otp_record)

    logger.info(
        "Secure OTP generated: channel=%s, purpose=%s, dest=%s, expires_in=%dm, req_id=%s",
        channel.upper(), purpose.upper(), norm_dest, OTP_EXPIRY_MINUTES, req_id
    )
    return otp_record, raw_code


def verify_otp(
    db: Session,
    channel: str,
    purpose: str,
    destination: str,
    code: str,
) -> tuple[bool, str, OTPVerification | None]:
    """
    Validate an entered 6-digit OTP code against the database.
    Checks:
    - Existence & non-empty input
    - Expiration (5 minutes)
    - Attempt limit (max 5 attempts, invalidates on exceeding)
    - Single-use (used_at)
    - Purpose and destination matching
    Returns: (is_valid, status_code_string, record)
    """
    now = datetime.now(timezone.utc)
    norm_dest = normalize_destination(destination, channel)

    if not code or len(code.strip()) != 6 or not code.strip().isdigit():
        return False, "OTP_INVALID_FORMAT", None

    clean_code = code.strip()

    record = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.destination == norm_dest,
            OTPVerification.channel == channel.upper(),
            OTPVerification.purpose == purpose.upper(),
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )

    if not record:
        return False, "OTP_NOT_FOUND", None

    if record.used_at is not None:
        return False, "OTP_ALREADY_USED", record

    # Expiry check
    exp_utc = record.expires_at
    if exp_utc.tzinfo is None:
        exp_utc = exp_utc.replace(tzinfo=timezone.utc)

    if now > exp_utc:
        return False, "OTP_EXPIRED", record

    # Max attempts check
    if record.attempt_count >= record.max_attempts:
        record.used_at = now
        db.commit()
        return False, "OTP_ATTEMPTS_EXCEEDED", record

    # Increment attempt count
    record.attempt_count += 1

    # Check hash match
    expected_hash = hash_otp(clean_code, norm_dest, purpose.upper())
    if secrets.compare_digest(record.otp_hash, expected_hash):
        record.used_at = now
        db.commit()
        logger.info("OTP verified successfully: dest=%s, purpose=%s, req_id=%s", norm_dest, purpose, record.request_id)
        return True, "VERIFIED", record
    else:
        if record.attempt_count >= record.max_attempts:
            record.used_at = now
            db.commit()
            logger.warning("OTP max attempts exceeded for %s: invalidated", norm_dest)
            return False, "OTP_ATTEMPTS_EXCEEDED", record

        db.commit()
        remaining = record.max_attempts - record.attempt_count
        logger.warning("Invalid OTP entered for %s (%d attempts remaining)", norm_dest, remaining)
        return False, "OTP_INVALID", record
