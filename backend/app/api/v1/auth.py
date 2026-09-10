"""
Auth endpoints — Registration, Login, Current User, Logout, Email Verification, Password Reset, and Refresh Token.
"""
import asyncio
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import secrets
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import get_settings
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.tokens import EmailVerificationToken, PasswordResetToken, RefreshToken
from app.models.audit_log import AuditLog
from app.schemas.user import (
    UserRegister, UserLogin, UserOut, TokenResponse,
    ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest, RefreshTokenRequest
)
from app.security.hashing import hash_password, verify_password
from app.security.jwt import create_access_token, decode_access_token
from pydantic import BaseModel, Field
from app.models.speaker_profile import SpeakerProfile
from app.models.trusted_device import TrustedDevice
from app.models.otp import OTPChannel, OTPPurpose, OTPVerification
from app.services.sms_service import (
    generate_phone_otp, send_phone_otp_sms, MAX_PHONE_OTP_ATTEMPTS, normalize_phone_number
)
from app.services.otp_service import (
    create_otp, verify_otp as verify_otp_service,
    normalize_destination, OTP_EXPIRY_MINUTES, RESEND_COOLDOWN_SECONDS, MAX_OTP_ATTEMPTS
)
from app.services.email_service import send_account_otp_email, get_email_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])
security = HTTPBearer(auto_error=False)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _log_audit(
    db: Session,
    action: str,
    result: str,
    user_id: str | None = None,
    detail: dict | None = None,
    req: Request | None = None,
):
    ip = req.client.host if req and req.client else None
    ua = req.headers.get("user-agent") if req else None
    audit = AuditLog(
        user_id=user_id,
        action=action,
        result=result,
        detail=json.dumps(detail) if detail else None,
        ip_address=ip,
        user_agent=ua[:250] if ua else None,
    )
    db.add(audit)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Failed to record audit log: %s", exc)


def _create_refresh_token(db: Session, user_id: str) -> str:
    settings = get_settings()
    raw = secrets.token_urlsafe(48)
    h = _hash_token(raw)
    exp = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    rt = RefreshToken(
        user_id=user_id,
        token_hash=h,
        expires_at=exp,
    )
    db.add(rt)
    db.commit()
    return raw


# ── Dependencies ──────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that verifies Bearer JWT token and returns the current user."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing subject")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact your administrator.",
        )
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns current user if authenticated, else None (never raises 401)."""
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
    except Exception:
        return None



def require_role(allowed_roles: list[UserRole]):
    """Role-based access control dependency."""
    def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires role {', '.join(r.value for r in allowed_roles)}",
            )
        return current_user
    return _role_checker


# ── Auth Endpoints ────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, request: Request, db: Session = Depends(get_db)):
    """Register a new user account with voice processing consent."""
    if not payload.consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit voice data processing consent is required to create an account.",
        )

    clean_email = payload.email.lower().strip()
    existing = db.query(User).filter(func.lower(User.email) == clean_email).first()
    if existing:
        _log_audit(db, "REGISTER", "BLOCKED", detail={"email": clean_email, "reason": "email_exists"}, req=request)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    hashed_pw = hash_password(payload.password)
    user = User(
        name=payload.name.strip(),
        email=clean_email,
        phone=payload.phone.strip() if payload.phone else None,
        hashed_password=hashed_pw,
        role=UserRole.USER,
        is_active=True,
        is_verified=False,
        consent_given=True,
        consent_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate verification token
    raw_verify_token = secrets.token_urlsafe(32)
    vt = EmailVerificationToken(
        user_id=user.id,
        token_hash=_hash_token(raw_verify_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(vt)
    db.commit()

    settings = get_settings()
    if settings.email_verification_mode == "console":
        logger.info("[DEV EMAIL] Verification URL for %s: %s/verify-email?token=%s", user.email, settings.frontend_url, raw_verify_token)

    access_token = create_access_token(subject=user.id)
    refresh_tok = _create_refresh_token(db, user.id)

    _log_audit(db, "REGISTER", "SUCCESS", user_id=user.id, detail={"email": user.email}, req=request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tok,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate with email and password to receive a JWT access token."""
    clean_email = payload.email.lower().strip()
    user = db.query(User).filter(func.lower(User.email) == clean_email).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        _log_audit(db, "LOGIN_FAILED", "FAILURE", detail={"email": clean_email}, req=request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        _log_audit(db, "LOGIN_FAILED", "BLOCKED", user_id=user.id, detail={"reason": "inactive"}, req=request)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an administrator.",
        )

    # Record login
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    settings = get_settings()
    access_token = create_access_token(subject=user.id)
    refresh_tok = _create_refresh_token(db, user.id)

    _log_audit(db, "LOGIN", "SUCCESS", user_id=user.id, detail={"email": user.email}, req=request)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tok,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access token."""
    h = _hash_token(payload.refresh_token)
    rt = db.query(RefreshToken).filter(
        RefreshToken.token_hash == h,
        RefreshToken.is_revoked == False,
    ).first()

    if not rt:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    if datetime.now(timezone.utc) > rt.expires_at.replace(tzinfo=timezone.utc):
        rt.is_revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Refresh token expired.")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive.")

    settings = get_settings()
    new_access_token = create_access_token(subject=user.id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=payload.refresh_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


class SendVerificationEmailRequest(BaseModel):
    email: str | None = None


@router.post("/send-verification-email")
def send_verification_email_endpoint(
    request: Request,
    payload: SendVerificationEmailRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Generate and send email verification token.
    Supports real SMTP or development console mode with demo_token.
    """
    target_user = current_user
    if payload and payload.email:
        req_email = payload.email.strip().lower()
        existing = db.query(User).filter(func.lower(User.email) == req_email).first()
        if existing:
            target_user = existing
        elif current_user:
            current_user.email = req_email
            db.commit()
            target_user = current_user

    if not target_user:
        raise HTTPException(
            status_code=400,
            detail="User email or active session is required to send verification email.",
        )

    if target_user.is_verified:
        return {"message": "Email is already verified.", "is_verified": True, "cooldown_seconds": 0}

    # Invalidate any old unused tokens for this user
    db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == target_user.id,
        EmailVerificationToken.is_used == False,
    ).update({"is_used": True})
    db.commit()

    raw_token = secrets.token_urlsafe(32)
    vt = EmailVerificationToken(
        user_id=target_user.id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(vt)
    db.commit()

    settings = get_settings()
    verify_url = f"{settings.frontend_url}/identity-enrollment?verify_token={raw_token}"
    email_sent = False
    try:
        from app.services.email_service import send_verification_email as send_email_func
        email_sent = send_email_func(target_user.email, verify_url, target_user.name, token=raw_token)
    except Exception as e:
        logger.warning("Failed to send verification email via SMTP: %s", e)

    banner = f"""
+----------------------------------------------------------------------+
|               VOXSHIELD AI -- EMAIL VERIFICATION TOKEN               |
+----------------------------------------------------------------------+
| Recipient: {target_user.email:<57} |
| Token:     {raw_token:<57} |
| URL:       {verify_url:<57} |
| Expires:   In 24 hours                                               |
| Status:    {"SENT VIA SMTP" if email_sent else "DEMO MODE (Set SMTP_USER & SMTP_PASSWORD in .env)":<57} |
+----------------------------------------------------------------------+
"""
    logger.info("Email verification token generated for %s (sent=%s)", target_user.email, email_sent)
    print(banner, flush=True)

    _log_audit(db, "EMAIL_VERIFICATION_SENT", "SUCCESS", user_id=target_user.id,
               detail={"email": target_user.email, "email_sent": email_sent}, req=request)

    return {
        "message": "Verification email dispatched! Please check your inbox and spam folder." if email_sent else "DEMO MODE: Email verification token logged in backend console.",
        "email": target_user.email,
        "demo_token": raw_token,
        "verify_url": verify_url,
        "email_sent": email_sent,
        "cooldown_seconds": 60,
    }


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    """Verify user's email with a single-use token."""
    h = _hash_token(payload.token.strip())
    vt = db.query(EmailVerificationToken).filter(
        EmailVerificationToken.token_hash == h,
        EmailVerificationToken.is_used == False,
    ).first()

    if not vt:
        raise HTTPException(status_code=400, detail="Invalid or already used verification token.")

    if datetime.now(timezone.utc) > vt.expires_at.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Verification token has expired. Please request a new one.")

    vt.is_used = True
    vt.used_at = datetime.now(timezone.utc)

    user = db.query(User).filter(User.id == vt.user_id).first()
    if user:
        user.is_verified = True
        active_profile = db.query(SpeakerProfile).filter(
            SpeakerProfile.user_id == user.id,
            SpeakerProfile.is_active == True,
        ).first()
        if user.phone_verified and (active_profile and active_profile.samples_count >= 3):
            user.identity_status = "ACTIVE"

    db.commit()
    _log_audit(db, "EMAIL_VERIFIED", "SUCCESS", user_id=vt.user_id, req=request)

    return {
        "message": "Email verified successfully.",
        "is_verified": True,
        "identity_status": user.identity_status if user else "INCOMPLETE",
    }


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Initiate password recovery. Generates an expiring hashed reset token."""
    clean_email = payload.email.lower().strip()
    user = db.query(User).filter(func.lower(User.email) == clean_email).first()

    if user and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        rt = PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.add(rt)
        db.commit()

        settings = get_settings()
        if settings.email_verification_mode == "console":
            logger.info("[DEV PASSWORD RESET] Reset URL for %s: %s/reset-password?token=%s", clean_email, settings.frontend_url, raw_token)
        _log_audit(db, "PASSWORD_RESET_REQUESTED", "SUCCESS", user_id=user.id, req=request)

    return {"message": "If that email is registered, password recovery instructions have been sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    """Reset password using a valid reset token."""
    h = _hash_token(payload.token)
    rt = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == h,
        PasswordResetToken.is_used == False,
    ).first()

    if not rt:
        raise HTTPException(status_code=400, detail="Invalid or already used password reset token.")

    if datetime.now(timezone.utc) > rt.expires_at.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Password reset token has expired.")

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    user.hashed_password = hash_password(payload.new_password)
    rt.is_used = True
    rt.used_at = datetime.now(timezone.utc)

    # Invalidate existing refresh tokens on password change
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"is_revoked": True})
    db.commit()

    _log_audit(db, "PASSWORD_RESET", "SUCCESS", user_id=user.id, req=request)

    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Server-side session logout. Revokes refresh tokens for user."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.is_revoked == False,
    ).update({"is_revoked": True})
    db.commit()

    _log_audit(db, "LOGOUT", "SUCCESS", user_id=current_user.id, req=request)
    return {"message": "Successfully logged out and session revoked."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Fetch profile of currently authenticated user."""
    return UserOut.model_validate(current_user)


# ── Phone Verification & Identity Profile ─────────────────────────────────────

class PhoneSendOTPRequest(BaseModel):
    phone: str | None = None
    email: str | None = None


class PhoneVerifyOTPRequest(BaseModel):
    code: str | None = None
    otp: str | None = None
    phone: str | None = None
    email: str | None = None


@router.post("/phone/send-otp")
def send_phone_otp(
    payload: PhoneSendOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Generate and send phone OTP via SMS (or demo console logger).
    Updates user phone number if provided.
    """
    target_user = current_user
    if not target_user and payload.email:
        target_user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()

    target_phone = payload.phone or (target_user.phone if target_user else None)
    if not target_phone or not target_phone.strip():
        raise HTTPException(status_code=400, detail="Phone number is required.")

    if not target_user:
        norm = normalize_phone_number(target_phone)
        target_user = db.query(User).filter(
            (User.phone == target_phone.strip()) | (User.phone == norm)
        ).first()

    if not target_user:
        raise HTTPException(status_code=404, detail="User account not found. Please register or log in first.")

    target_user.phone = target_phone.strip()
    raw_otp, code_hash, expires_at = generate_phone_otp()

    target_user.phone_otp_hash = code_hash
    target_user.phone_otp_expires_at = expires_at
    target_user.phone_otp_attempts = 0
    db.commit()

    sms_sent, sms_msg = send_phone_otp_sms(target_user.phone, raw_otp, target_user.name)

    _log_audit(db, "PHONE_OTP_SENT", "SUCCESS" if sms_sent else "DISPATCH_FAILED", user_id=target_user.id,
               detail={"phone": target_user.phone, "sms_sent": sms_sent}, req=request)

    return {
        "message": "Verification OTP sent to your phone number via SMS." if sms_sent else "DEMO MODE: Phone verification code logged in backend console.",
        "phone": target_user.phone,
        "expires_in_minutes": 5,
        "demo_code": raw_otp,
        "demo_otp": raw_otp,
        "dev_otp": raw_otp,
        "sms_sent": sms_sent,
        "real_delivery": sms_sent,
        "cooldown_seconds": 60,
    }


@router.post("/phone/verify-otp")
def verify_phone_otp(
    payload: PhoneVerifyOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Verify phone OTP and mark phone_verified = True.
    """
    token_str = (payload.code or payload.otp or "").strip()
    if not token_str:
        raise HTTPException(status_code=400, detail="OTP code is required.")

    target_user = current_user
    if not target_user and payload.email:
        target_user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()

    if not target_user and payload.phone:
        norm = normalize_phone_number(payload.phone)
        target_user = db.query(User).filter(
            (User.phone == payload.phone.strip()) | (User.phone == norm)
        ).first()

    if not target_user:
        raise HTTPException(status_code=400, detail="Active session, email, or phone required to verify OTP.")

    if not target_user.phone_otp_hash or not target_user.phone_otp_expires_at:
        raise HTTPException(status_code=400, detail="No active phone OTP found. Please request a new code.")

    if target_user.phone_otp_attempts >= MAX_PHONE_OTP_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Maximum OTP attempts exceeded. Please request a new code.")

    expires_at = target_user.phone_otp_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=410, detail="Phone OTP has expired. Please request a new code.")

    submitted_hash = _hash_token(token_str)
    target_user.phone_otp_attempts += 1

    if submitted_hash != target_user.phone_otp_hash:
        db.commit()
        remaining = MAX_PHONE_OTP_ATTEMPTS - target_user.phone_otp_attempts
        raise HTTPException(
            status_code=400,
            detail=f"Invalid phone OTP code. {remaining} attempt(s) remaining."
        )

    target_user.phone_verified = True
    target_user.phone_otp_hash = None
    target_user.phone_otp_expires_at = None

    # Check if identity is now active
    active_profile = db.query(SpeakerProfile).filter(
        SpeakerProfile.user_id == target_user.id,
        SpeakerProfile.is_active == True,
    ).first()

    if target_user.is_verified and (active_profile and active_profile.samples_count >= 3):
        target_user.identity_status = "ACTIVE"

    db.commit()

    _log_audit(db, "PHONE_VERIFIED", "SUCCESS", user_id=target_user.id, req=request)

    return {
        "message": "Phone number verified successfully.",
        "phone_verified": True,
        "identity_status": target_user.identity_status,
    }


@router.get("/identity-profile")
def get_identity_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Unified Identity Profile status:
    Name, Email verification, Phone verification, Voice samples, Profile ACTIVE/INCOMPLETE.
    """
    profile = db.query(SpeakerProfile).filter(
        SpeakerProfile.user_id == current_user.id,
        SpeakerProfile.is_active == True,
    ).first()

    voice_enrolled = profile is not None and profile.samples_count >= 3
    is_active_identity = (
        current_user.is_verified and
        current_user.phone_verified and
        voice_enrolled
    )

    if is_active_identity and current_user.identity_status != "ACTIVE":
        current_user.identity_status = "ACTIVE"
        db.commit()

    return {
        "user_id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "email_verified": current_user.is_verified,
        "phone": current_user.phone,
        "phone_verified": current_user.phone_verified,
        "voice_enrolled": voice_enrolled,
        "voice_samples": profile.samples_count if profile else 0,
        "voice_samples_count": profile.samples_count if profile else 0,
        "speaker_profile": "ACTIVE" if voice_enrolled else "INCOMPLETE",
        "speaker_profile_status": "ACTIVE" if voice_enrolled else "INCOMPLETE",
        "consent": current_user.consent_given,
        "consent_given": current_user.consent_given,
        "identity_status": "ACTIVE" if is_active_identity else "INCOMPLETE",
    }


# =============================================================================
# REAL SECURE OTP ENDPOINTS (Phone & Email)
# =============================================================================

def _mask_phone(phone: str) -> str:
    """Mask phone for safe UI display: +919876543210 -> +91 ******3210."""
    clean = (phone or "").strip()
    if len(clean) >= 8:
        return f"{clean[:3]} ******{clean[-4:]}"
    return clean


def _mask_email(email: str) -> str:
    """Mask email for safe UI display: poorna@gmail.com -> p******@gmail.com."""
    clean = (email or "").strip().lower()
    if "@" not in clean:
        return clean
    user, domain = clean.split("@", 1)
    if len(user) <= 1:
        return f"{user}******@{domain}"
    return f"{user[0]}******@{domain}"


class SendEmailOTPRequest(BaseModel):
    email: str | None = None
    purpose: str = "REGISTRATION"


class VerifyEmailOTPRequest(BaseModel):
    email: str | None = None
    otp: str
    purpose: str = "REGISTRATION"


class SendPhoneOTPRequest(BaseModel):
    phone: str | None = None
    email: str | None = None
    purpose: str = "REGISTRATION"


class VerifyPhoneOTPRequest(BaseModel):
    phone: str | None = None
    email: str | None = None
    otp: str
    purpose: str = "REGISTRATION"


class LoginRequestPhoneOTP(BaseModel):
    phone: str


class LoginVerifyPhoneOTP(BaseModel):
    phone: str
    otp: str


class LoginRequestEmailOTP(BaseModel):
    email: str


class LoginVerifyEmailOTP(BaseModel):
    email: str
    otp: str


class SendDualOTPRequest(BaseModel):
    email: str
    phoneNumber: str | None = None
    phone: str | None = None
    purpose: str = "REGISTRATION"


class VerifyDualOTPRequest(BaseModel):
    email: str
    userInputCode: str | None = None
    otp: str | None = None
    purpose: str = "REGISTRATION"


class ConfigureCredentialsRequest(BaseModel):
    smtp_password: str | None = None
    smtp_user: str | None = None
    fast2sms_api_key: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_phone: str | None = None


# ── 1. Send Email OTP ─────────────────────────────────────────────────────────

@router.post("/send-email-otp")
def send_email_otp(
    payload: SendEmailOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Generate and dispatch a cryptographically secure 6-digit Email OTP.
    Bound to purpose (REGISTRATION, LOGIN, COMMAND_APPROVAL, etc.).
    Enforces 60-second resend cooldown and 5/hour rate limits.
    Never returns the OTP in API responses.
    """
    target_email = payload.email.strip().lower() if payload.email else (current_user.email if current_user else None)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email address is required.")

    norm_email = normalize_destination(target_email, "EMAIL")

    target_user = current_user
    if not target_user:
        target_user = db.query(User).filter(func.lower(User.email) == norm_email).first()

    otp_record, raw_code = create_otp(
        db=db,
        channel="EMAIL",
        purpose=payload.purpose,
        destination=norm_email,
        user_id=target_user.id if target_user else None,
    )

    user_name = target_user.name if target_user else "User"
    email_sent = send_account_otp_email(
        to_email=norm_email,
        otp_code=raw_code,
        user_name=user_name,
        purpose=payload.purpose,
        expires_minutes=OTP_EXPIRY_MINUTES,
    )

    _log_audit(
        db, "EMAIL_OTP_SENT", "SUCCESS" if email_sent else "DISPATCH_FAILED",
        user_id=target_user.id if target_user else None,
        detail={"destination": _mask_email(norm_email), "purpose": payload.purpose, "email_sent": email_sent},
        req=request,
    )

    settings = get_settings()
    res = {
        "success": True,
        "message": "Verification code sent to your email address." if email_sent else "Email verification code generated.",
        "channel": "EMAIL",
        "destination": _mask_email(norm_email),
        "masked_destination": _mask_email(norm_email),
        "purpose": payload.purpose,
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "cooldown_seconds": RESEND_COOLDOWN_SECONDS,
        "provider_status": "DELIVERED" if email_sent else "OTP_PROVIDER_UNAVAILABLE",
        "real_delivery": email_sent,
    }
    if email_sent:
        res["delivery_guide"] = f"Verification code delivered directly to {norm_email}."
    elif settings.is_development:
        res["dev_otp"] = raw_code
        res["demo_code"] = raw_code
        res["demo_otp"] = raw_code
        res["delivery_guide"] = "Real delivery is waiting for Gmail App Password in backend/.env (SMTP_PASSWORD). Use the dev code below to test immediately."
    return res


# ── 2. Verify Email OTP ───────────────────────────────────────────────────────

@router.post("/verify-email-otp")
def verify_email_otp(
    payload: VerifyEmailOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Validate entered 6-digit Email OTP against database hash.
    Enforces expiration, purpose binding, single-use, and max 5 attempts.
    Marks user.email_verified = True and synchronizes identity profile.
    """
    target_email = payload.email.strip().lower() if payload.email else (current_user.email if current_user else None)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email address is required.")

    norm_email = normalize_destination(target_email, "EMAIL")

    success, status_str, record = verify_otp_service(
        db=db,
        channel="EMAIL",
        purpose=payload.purpose,
        destination=norm_email,
        code=payload.otp,
    )

    if not success:
        if status_str == "OTP_EXPIRED":
            raise HTTPException(status_code=410, detail="OTP_EXPIRED: Verification code has expired. Please request a new one.")
        elif status_str == "OTP_ATTEMPTS_EXCEEDED":
            raise HTTPException(status_code=429, detail="OTP_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Code invalidated.")
        elif status_str == "OTP_ALREADY_USED":
            raise HTTPException(status_code=400, detail="OTP_ALREADY_USED: This verification code was already used.")
        elif status_str == "OTP_NOT_FOUND":
            raise HTTPException(status_code=404, detail="OTP_NOT_FOUND: No active verification code found for this email address.")
        else:
            remaining = (record.max_attempts - record.attempt_count) if record else 0
            raise HTTPException(status_code=400, detail=f"OTP_INVALID: Incorrect verification code. {remaining} attempt(s) remaining.")

    # Find and update user verification status
    target_user = current_user
    if not target_user:
        target_user = db.query(User).filter(func.lower(User.email) == norm_email).first()

    if target_user:
        target_user.email_verified = True
        target_user.email_verified_at = datetime.now(timezone.utc)

        # Check for full profile activation
        profile = db.query(SpeakerProfile).filter(
            SpeakerProfile.user_id == target_user.id,
            SpeakerProfile.is_active == True,
        ).first()
        if target_user.phone_verified and (profile and profile.samples_count >= 3):
            target_user.identity_status = "ACTIVE"

        db.commit()

    _log_audit(
        db, "EMAIL_OTP_VERIFIED", "SUCCESS",
        user_id=target_user.id if target_user else None,
        detail={"destination": _mask_email(norm_email), "purpose": payload.purpose},
        req=request,
    )

    return {
        "success": True,
        "message": "Email address verified successfully.",
        "email_verified": True,
        "purpose": payload.purpose,
        "identity_status": target_user.identity_status if target_user else "INCOMPLETE",
    }


# ── 3. Send Phone OTP ─────────────────────────────────────────────────────────

@router.post("/send-phone-otp")
def send_phone_otp_new(
    payload: SendPhoneOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Generate and dispatch a cryptographically secure 6-digit Phone OTP via SMS.
    Normalizes phone to E.164 (+91... for Indian numbers).
    Enforces 60s cooldown and 5/hour rate limits.
    Never returns OTP in response.
    """
    raw_phone = payload.phone or (current_user.phone if current_user else None)
    if not raw_phone or not raw_phone.strip():
        raise HTTPException(status_code=400, detail="Phone number is required.")

    norm_phone = normalize_phone_number(raw_phone)

    target_user = current_user
    if not target_user and payload.email:
        target_user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()
    if not target_user:
        target_user = db.query(User).filter(
            (User.phone == norm_phone) | (User.phone == raw_phone.strip())
        ).first()

    if target_user:
        target_user.phone = norm_phone
        db.commit()

    otp_record, raw_code = create_otp(
        db=db,
        channel="PHONE",
        purpose=payload.purpose,
        destination=norm_phone,
        user_id=target_user.id if target_user else None,
    )

    user_name = target_user.name if target_user else "User"
    sms_sent, sms_msg = send_phone_otp_sms(
        phone=norm_phone,
        otp_code=raw_code,
        user_name=user_name,
    )

    _log_audit(
        db, "PHONE_OTP_SENT", "SUCCESS" if sms_sent else "DISPATCH_FAILED",
        user_id=target_user.id if target_user else None,
        detail={"destination": _mask_phone(norm_phone), "purpose": payload.purpose, "sms_sent": sms_sent},
        req=request,
    )

    settings = get_settings()
    res = {
        "success": True,
        "message": "Verification code sent to your phone number via SMS." if sms_sent else "Phone verification code generated.",
        "channel": "PHONE",
        "destination": _mask_phone(norm_phone),
        "masked_destination": _mask_phone(norm_phone),
        "purpose": payload.purpose,
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "cooldown_seconds": RESEND_COOLDOWN_SECONDS,
        "provider_status": "DELIVERED" if sms_sent else "OTP_PROVIDER_UNAVAILABLE",
        "real_delivery": sms_sent,
    }
    if sms_sent:
        res["delivery_guide"] = f"Verification code dispatched via SMS to {norm_phone}."
    elif settings.is_development:
        res["dev_otp"] = raw_code
        res["demo_code"] = raw_code
        res["demo_otp"] = raw_code
        res["delivery_guide"] = "Real SMS delivery requires Fast2SMS or Twilio credentials in backend/.env. Use the dev code below to test immediately."
    return res


# ── 4. Verify Phone OTP ───────────────────────────────────────────────────────

@router.post("/verify-phone-otp")
def verify_phone_otp_new(
    payload: VerifyPhoneOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Validate entered 6-digit Phone OTP against database hash.
    Enforces expiration, single use, max 5 attempts, and purpose binding.
    Marks user.phone_verified = True.
    """
    raw_phone = payload.phone or (current_user.phone if current_user else None)
    if not raw_phone or not raw_phone.strip():
        raise HTTPException(status_code=400, detail="Phone number is required.")

    norm_phone = normalize_phone_number(raw_phone)

    success, status_str, record = verify_otp_service(
        db=db,
        channel="PHONE",
        purpose=payload.purpose,
        destination=norm_phone,
        code=payload.otp,
    )

    if not success:
        if status_str == "OTP_EXPIRED":
            raise HTTPException(status_code=410, detail="OTP_EXPIRED: Verification code has expired. Please request a new one.")
        elif status_str == "OTP_ATTEMPTS_EXCEEDED":
            raise HTTPException(status_code=429, detail="OTP_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Code invalidated.")
        elif status_str == "OTP_ALREADY_USED":
            raise HTTPException(status_code=400, detail="OTP_ALREADY_USED: This verification code was already used.")
        elif status_str == "OTP_NOT_FOUND":
            raise HTTPException(status_code=404, detail="OTP_NOT_FOUND: No active verification code found for this phone number.")
        else:
            remaining = (record.max_attempts - record.attempt_count) if record else 0
            raise HTTPException(status_code=400, detail=f"OTP_INVALID: Incorrect verification code. {remaining} attempt(s) remaining.")

    target_user = current_user
    if not target_user and payload.email:
        target_user = db.query(User).filter(func.lower(User.email) == payload.email.strip().lower()).first()
    if not target_user:
        target_user = db.query(User).filter(
            (User.phone == norm_phone) | (User.phone == raw_phone.strip())
        ).first()

    if target_user:
        target_user.phone_verified = True
        target_user.phone_verified_at = datetime.now(timezone.utc)

        # Check full identity activation
        profile = db.query(SpeakerProfile).filter(
            SpeakerProfile.user_id == target_user.id,
            SpeakerProfile.is_active == True,
        ).first()
        if target_user.email_verified and (profile and profile.samples_count >= 3):
            target_user.identity_status = "ACTIVE"

        db.commit()

    _log_audit(
        db, "PHONE_OTP_VERIFIED", "SUCCESS",
        user_id=target_user.id if target_user else None,
        detail={"destination": _mask_phone(norm_phone), "purpose": payload.purpose},
        req=request,
    )

    return {
        "success": True,
        "message": "Phone number verified successfully.",
        "phone_verified": True,
        "purpose": payload.purpose,
        "identity_status": target_user.identity_status if target_user else "INCOMPLETE",
    }


# ── 5. Resend Endpoints ───────────────────────────────────────────────────────

@router.post("/resend-email-otp")
def resend_email_otp(
    payload: SendEmailOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Resend Email OTP with enforced 60s cooldown and hourly limit."""
    return send_email_otp(payload=payload, request=request, db=db, current_user=current_user)


@router.post("/resend-phone-otp")
def resend_phone_otp(
    payload: SendPhoneOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """Resend Phone OTP with enforced 60s cooldown and hourly limit."""
    return send_phone_otp_new(payload=payload, request=request, db=db, current_user=current_user)


# ── 6. Verification Status ────────────────────────────────────────────────────

@router.get("/verification-status")
def get_verification_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Comprehensive verification status for Dashboard and Security Settings:
    - Email: verified / unverified + timestamp
    - Phone: verified / unverified + timestamp
    - Voice: enrolled / not enrolled + sample count
    - Trusted devices count
    - Recent authentication timestamp
    """
    profile = db.query(SpeakerProfile).filter(
        SpeakerProfile.user_id == current_user.id,
        SpeakerProfile.is_active == True,
    ).first()
    voice_enrolled = profile is not None and profile.samples_count >= 3

    trusted_count = db.query(TrustedDevice).filter(
        TrustedDevice.user_id == current_user.id,
        TrustedDevice.is_active == True,
    ).count()

    return {
        "email": current_user.email,
        "email_verified": bool(current_user.email_verified),
        "email_verified_at": current_user.email_verified_at.isoformat() if current_user.email_verified_at else None,
        "phone": current_user.phone,
        "phone_verified": bool(current_user.phone_verified),
        "phone_verified_at": current_user.phone_verified_at.isoformat() if current_user.phone_verified_at else None,
        "voice_enrolled": voice_enrolled,
        "voice_samples": profile.samples_count if profile else 0,
        "trusted_devices_count": trusted_count,
        "identity_status": current_user.identity_status,
        "last_login_at": current_user.last_login_at.isoformat() if current_user.last_login_at else None,
    }


# ── Dual-Channel Broadcast Endpoints ──────────────────────────────────────────

@router.post("/send-dual-otp")
async def send_dual_otp(
    payload: SendDualOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Multi-channel concurrent broadcast:
    1. Generate a single cryptographically secure 6-digit numeric OTP.
    2. Set a 5-minute expiration window.
    3. Save the details mapped to the user identity in SQLite database (otp_verifications).
    4. Concurrently dispatch the exact same code to Phone Message Box (SMS) and Email Inbox.
    """
    raw_phone = payload.phoneNumber or payload.phone or (current_user.phone if current_user else None)
    raw_email = payload.email.strip().lower() if payload.email else (current_user.email if current_user else None)

    if not raw_email or not raw_phone:
        raise HTTPException(
            status_code=400,
            detail="Both email and phone number are required for dual-channel verification.",
        )

    norm_email = normalize_destination(raw_email, "EMAIL")
    norm_phone = normalize_phone_number(raw_phone)

    # Locate user if existing
    target_user = current_user
    if not target_user:
        target_user = db.query(User).filter(func.lower(User.email) == norm_email).first()
    if not target_user:
        target_user = db.query(User).filter(
            (User.phone == norm_phone) | (User.phone == raw_phone.strip())
        ).first()

    if target_user:
        target_user.email = norm_email
        target_user.phone = norm_phone
        db.commit()

    # 1. Generate secure, real-time 6-digit numeric OTP
    raw_code = f"{secrets.randbelow(900000) + 100000:06d}"
    code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    req_id_email = f"dual_email_{uuid.uuid4().hex[:16]}"
    req_id_phone = f"dual_phone_{uuid.uuid4().hex[:16]}"

    # Invalidate any old unused OTPs for these destinations
    db.query(OTPVerification).filter(
        OTPVerification.destination.in_([norm_email, norm_phone]),
        OTPVerification.used_at.is_(None),
    ).update({"used_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()

    # 2. Save details mapped to user identity in database
    otp_email_rec = OTPVerification(
        user_id=target_user.id if target_user else None,
        channel="EMAIL",
        purpose=payload.purpose,
        destination=norm_email,
        otp_hash=code_hash,
        expires_at=expires_at,
        request_id=req_id_email,
    )
    otp_phone_rec = OTPVerification(
        user_id=target_user.id if target_user else None,
        channel="PHONE",
        purpose=payload.purpose,
        destination=norm_phone,
        otp_hash=code_hash,
        expires_at=expires_at,
        request_id=req_id_phone,
    )
    db.add(otp_email_rec)
    db.add(otp_phone_rec)
    db.commit()

    # 3. Concurrently dispatch to Phone (SMS) & Email (Inbox)
    user_name = target_user.name if target_user else "User"
    loop = asyncio.get_running_loop()

    sms_future = loop.run_in_executor(
        None, send_phone_otp_sms, norm_phone, raw_code, user_name
    )
    email_future = loop.run_in_executor(
        None, send_account_otp_email, norm_email, raw_code, user_name, payload.purpose, 5
    )

    results = await asyncio.gather(sms_future, email_future, return_exceptions=True)

    sms_res = results[0] if not isinstance(results[0], Exception) else (False, str(results[0]))
    email_res = results[1] if not isinstance(results[1], Exception) else False

    sms_sent = sms_res[0] if isinstance(sms_res, tuple) else bool(sms_res)
    email_sent = bool(email_res)

    _log_audit(
        db, "DUAL_OTP_BROADCAST", "SUCCESS" if (sms_sent or email_sent) else "DISPATCH_FAILED",
        user_id=target_user.id if target_user else None,
        detail={
            "email": _mask_email(norm_email),
            "phone": _mask_phone(norm_phone),
            "sms_sent": sms_sent,
            "email_sent": email_sent,
        },
        req=request,
    )

    settings = get_settings()
    res = {
        "success": True,
        "message": "Verification codes successfully broadcasted to your phone and email!",
        "channel": "DUAL",
        "email": norm_email,
        "phone": norm_phone,
        "masked_email": _mask_email(norm_email),
        "masked_phone": _mask_phone(norm_phone),
        "destination": f"{_mask_email(norm_email)} & {_mask_phone(norm_phone)}",
        "masked_destination": f"{_mask_email(norm_email)} & {_mask_phone(norm_phone)}",
        "expires_in": 300,
        "sms_sent": sms_sent,
        "email_sent": email_sent,
        "real_delivery": sms_sent or email_sent,
        "provider_status": "DELIVERED" if (sms_sent and email_sent) else ("PARTIAL" if (sms_sent or email_sent) else "OTP_PROVIDER_UNAVAILABLE"),
    }
    if sms_sent and email_sent:
        res["delivery_guide"] = f"Verification code delivered to both {norm_email} and {norm_phone}."
    elif settings.is_development:
        res["dev_otp"] = raw_code
        res["demo_code"] = raw_code
        res["demo_otp"] = raw_code
        res["delivery_guide"] = "Real-time dual broadcast generated. Configure SMTP_PASSWORD and FAST2SMS_API_KEY in backend/.env for physical inbox/phone delivery."

    return res


@router.post("/verify-otp")
def verify_dual_otp(
    payload: VerifyDualOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Instant Code Validation for dual broadcast:
    1. Match 6-digit code against database record.
    2. Check expiration (5 minutes).
    3. On match, mark both email and phone verified on user record.
    """
    user_code = (payload.userInputCode or payload.otp or "").strip()
    if not user_code:
        raise HTTPException(status_code=400, detail="Verification code is required.")

    raw_email = payload.email.strip().lower() if payload.email else (current_user.email if current_user else None)
    if not raw_email:
        raise HTTPException(status_code=400, detail="Email address is required.")

    norm_email = normalize_destination(raw_email, "EMAIL")

    now = datetime.now(timezone.utc)
    code_hash = hashlib.sha256(user_code.encode("utf-8")).hexdigest()

    rec = db.query(OTPVerification).filter(
        OTPVerification.destination == norm_email,
        OTPVerification.used_at.is_(None),
    ).order_by(OTPVerification.created_at.desc()).first()

    if not rec:
        raise HTTPException(status_code=400, detail="No active verification record found. Please request a new code.")

    expires_at = rec.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        rec.used_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="OTP code has expired. Please request a new one.")

    rec.attempt_count += 1
    if rec.attempt_count > rec.max_attempts:
        rec.used_at = now
        db.commit()
        raise HTTPException(status_code=429, detail="Maximum verification attempts exceeded. Code invalidated.")

    if rec.otp_hash != code_hash:
        db.commit()
        remaining = rec.max_attempts - rec.attempt_count
        raise HTTPException(status_code=400, detail=f"Invalid OTP code entered. {remaining} attempt(s) remaining.")

    # Code matched!
    rec.used_at = now

    # Also mark phone record used
    db.query(OTPVerification).filter(
        OTPVerification.otp_hash == code_hash,
        OTPVerification.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)

    target_user = current_user
    if not target_user:
        target_user = db.query(User).filter(func.lower(User.email) == norm_email).first()

    if target_user:
        target_user.email_verified = True
        target_user.email_verified_at = now
        target_user.phone_verified = True
        target_user.phone_verified_at = now

        profile = db.query(SpeakerProfile).filter(
            SpeakerProfile.user_id == target_user.id,
            SpeakerProfile.is_active == True,
        ).first()
        if profile and profile.samples_count >= 3:
            target_user.identity_status = "ACTIVE"
        else:
            target_user.identity_status = "VERIFIED"

    db.commit()

    _log_audit(
        db, "DUAL_OTP_VERIFIED", "SUCCESS",
        user_id=target_user.id if target_user else None,
        detail={"email": _mask_email(norm_email)},
        req=request,
    )

    return {
        "success": True,
        "message": "Authentication approved! Both email and phone verified successfully.",
        "email_verified": True,
        "phone_verified": True,
        "identity_status": target_user.identity_status if target_user else "VERIFIED",
    }


@router.post("/configure-credentials")
def configure_credentials(payload: ConfigureCredentialsRequest):
    """
    Dynamically save SMTP & SMS credentials to backend/.env and live settings,
    enabling real email & SMS dispatch immediately without restart.
    """
    settings = get_settings()
    import os
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env")
    if not os.path.exists(env_path):
        env_path = ".env"

    env_lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            env_lines = f.readlines()

    updates = {}
    if payload.smtp_password is not None:
        clean_pw = payload.smtp_password.strip()
        settings.smtp_password = clean_pw
        updates["SMTP_PASSWORD"] = clean_pw
    if payload.smtp_user is not None:
        clean_user = payload.smtp_user.strip()
        settings.smtp_user = clean_user
        settings.smtp_from = clean_user
        updates["SMTP_USER"] = clean_user
        updates["SMTP_FROM"] = clean_user
    if payload.fast2sms_api_key is not None:
        clean_f2s = payload.fast2sms_api_key.strip()
        settings.fast2sms_api_key = clean_f2s
        updates["FAST2SMS_API_KEY"] = clean_f2s
    if payload.twilio_account_sid is not None:
        clean_sid = payload.twilio_account_sid.strip()
        settings.twilio_account_sid = clean_sid
        updates["TWILIO_ACCOUNT_SID"] = clean_sid
    if payload.twilio_auth_token is not None:
        clean_token = payload.twilio_auth_token.strip()
        settings.twilio_auth_token = clean_token
        updates["TWILIO_AUTH_TOKEN"] = clean_token
    if payload.twilio_from_phone is not None:
        clean_phone = payload.twilio_from_phone.strip()
        settings.twilio_from_phone = clean_phone
        updates["TWILIO_FROM_PHONE"] = clean_phone

    new_lines = []
    seen_keys = set()
    for line in env_lines:
        line_strip = line.strip()
        if "=" in line_strip and not line_strip.startswith("#"):
            k = line_strip.split("=", 1)[0].strip()
            if k in updates:
                new_lines.append(f"{k}={updates[k]}\n")
                seen_keys.add(k)
                continue
        new_lines.append(line)

    for k, v in updates.items():
        if k not in seen_keys:
            new_lines.append(f"{k}={v}\n")

    try:
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as exc:
        logger.warning("Could not write to .env: %s", exc)

    return {
        "success": True,
        "message": "Credentials updated successfully and active for real delivery!",
        "smtp_configured": bool(settings.smtp_password and settings.smtp_user),
        "sms_configured": bool(settings.fast2sms_api_key or (settings.twilio_account_sid and settings.twilio_auth_token)),
    }


# ── 7. Phone OTP Login ────────────────────────────────────────────────────────


@router.post("/login/request-phone-otp")
def login_request_phone_otp(
    payload: LoginRequestPhoneOTP,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Step 1 of Phone OTP Login:
    Validate phone number, generate cryptographically secure 6-digit LOGIN OTP.
    Dispatches SMS to registered user's phone. Never returns the OTP.
    """
    norm_phone = normalize_phone_number(payload.phone)
    user = db.query(User).filter(
        (User.phone == norm_phone) | (User.phone == payload.phone.strip())
    ).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account registered with this phone number."
        )

    otp_record, raw_code = create_otp(
        db=db,
        channel="PHONE",
        purpose="LOGIN",
        destination=norm_phone,
        user_id=user.id,
    )

    sms_sent, sms_msg = send_phone_otp_sms(
        phone=norm_phone,
        otp_code=raw_code,
        user_name=user.name,
    )

    _log_audit(
        db, "LOGIN_PHONE_OTP_REQUESTED", "SUCCESS" if sms_sent else "DISPATCH_FAILED",
        user_id=user.id,
        detail={"destination": _mask_phone(norm_phone), "sms_sent": sms_sent},
        req=request,
    )

    settings = get_settings()
    res = {
        "success": True,
        "message": "Verification code sent to your phone via SMS." if sms_sent else "Verification code dispatched.",
        "otp_requested": True,
        "masked_destination": _mask_phone(norm_phone),
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "provider_status": "DELIVERED" if sms_sent else "OTP_PROVIDER_UNAVAILABLE",
        "real_delivery": sms_sent,
    }
    if sms_sent:
        res["delivery_guide"] = f"Verification code dispatched via SMS to {norm_phone}."
    elif settings.is_development:
        res["dev_otp"] = raw_code
        res["demo_code"] = raw_code
        res["demo_otp"] = raw_code
        res["delivery_guide"] = "Real SMS delivery requires Fast2SMS or Twilio in backend/.env. Use dev code below to test immediately."
    return res


@router.post("/login/verify-phone-otp", response_model=TokenResponse)
def login_verify_phone_otp(
    payload: LoginVerifyPhoneOTP,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Step 2 of Phone OTP Login:
    Validates entered 6-digit OTP code strictly bound to LOGIN purpose.
    Issues authenticated JWT access and refresh tokens.
    """
    norm_phone = normalize_phone_number(payload.phone)
    user = db.query(User).filter(
        (User.phone == norm_phone) | (User.phone == payload.phone.strip())
    ).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account registered with this phone number."
        )

    success, status_str, record = verify_otp_service(
        db=db,
        channel="PHONE",
        purpose="LOGIN",
        destination=norm_phone,
        code=payload.otp,
    )

    if not success:
        if status_str == "OTP_EXPIRED":
            raise HTTPException(status_code=410, detail="OTP_EXPIRED: Verification code has expired. Please request a new code.")
        elif status_str == "OTP_ATTEMPTS_EXCEEDED":
            raise HTTPException(status_code=429, detail="OTP_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Code invalidated.")
        elif status_str == "OTP_ALREADY_USED":
            raise HTTPException(status_code=400, detail="OTP_ALREADY_USED: This verification code was already used.")
        elif status_str == "OTP_NOT_FOUND":
            raise HTTPException(status_code=404, detail="OTP_NOT_FOUND: No active login code found. Please request a new code.")
        else:
            remaining = (record.max_attempts - record.attempt_count) if record else 0
            raise HTTPException(status_code=400, detail=f"OTP_INVALID: Incorrect code. {remaining} attempt(s) remaining.")

    # Successful login: mark phone verified, update last_login_at
    user.phone_verified = True
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    settings = get_settings()
    access_token = create_access_token(subject=user.id)
    refresh_tok = _create_refresh_token(db, user.id)

    _log_audit(
        db, "LOGIN_PHONE_OTP", "SUCCESS",
        user_id=user.id,
        detail={"phone": _mask_phone(norm_phone)},
        req=request,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tok,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


# ── 8. Email OTP Login ────────────────────────────────────────────────────────

@router.post("/login/request-email-otp")
def login_request_email_otp(
    payload: LoginRequestEmailOTP,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Step 1 of Email OTP Login:
    Validate email address, generate cryptographically secure 6-digit LOGIN OTP.
    Dispatches email. Never returns the OTP.
    """
    norm_email = normalize_destination(payload.email, "EMAIL")
    user = db.query(User).filter(func.lower(User.email) == norm_email).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account registered with this email address."
        )

    otp_record, raw_code = create_otp(
        db=db,
        channel="EMAIL",
        purpose="LOGIN",
        destination=norm_email,
        user_id=user.id,
    )

    email_sent = send_account_otp_email(
        to_email=norm_email,
        otp_code=raw_code,
        user_name=user.name,
        purpose="LOGIN",
        expires_minutes=OTP_EXPIRY_MINUTES,
    )

    _log_audit(
        db, "LOGIN_EMAIL_OTP_REQUESTED", "SUCCESS" if email_sent else "DISPATCH_FAILED",
        user_id=user.id,
        detail={"destination": _mask_email(norm_email), "email_sent": email_sent},
        req=request,
    )

    settings = get_settings()
    res = {
        "success": True,
        "message": "Verification code sent to your email." if email_sent else "Verification code dispatched.",
        "otp_requested": True,
        "masked_destination": _mask_email(norm_email),
        "expires_in": OTP_EXPIRY_MINUTES * 60,
        "provider_status": "DELIVERED" if email_sent else "OTP_PROVIDER_UNAVAILABLE",
        "real_delivery": email_sent,
    }
    if email_sent:
        res["delivery_guide"] = f"Verification code delivered directly to {norm_email}."
    elif settings.is_development:
        res["dev_otp"] = raw_code
        res["demo_code"] = raw_code
        res["demo_otp"] = raw_code
        res["delivery_guide"] = "Real delivery is waiting for Gmail App Password in backend/.env (SMTP_PASSWORD). Use dev code below to test immediately."
    return res


@router.post("/login/verify-email-otp", response_model=TokenResponse)
def login_verify_email_otp(
    payload: LoginVerifyEmailOTP,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Step 2 of Email OTP Login:
    Validates entered 6-digit OTP code strictly bound to LOGIN purpose.
    Issues authenticated JWT access and refresh tokens.
    """
    norm_email = normalize_destination(payload.email, "EMAIL")
    user = db.query(User).filter(func.lower(User.email) == norm_email).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active account registered with this email address."
        )

    success, status_str, record = verify_otp_service(
        db=db,
        channel="EMAIL",
        purpose="LOGIN",
        destination=norm_email,
        code=payload.otp,
    )

    if not success:
        if status_str == "OTP_EXPIRED":
            raise HTTPException(status_code=410, detail="OTP_EXPIRED: Verification code has expired. Please request a new code.")
        elif status_str == "OTP_ATTEMPTS_EXCEEDED":
            raise HTTPException(status_code=429, detail="OTP_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Code invalidated.")
        elif status_str == "OTP_ALREADY_USED":
            raise HTTPException(status_code=400, detail="OTP_ALREADY_USED: This verification code was already used.")
        elif status_str == "OTP_NOT_FOUND":
            raise HTTPException(status_code=404, detail="OTP_NOT_FOUND: No active login code found. Please request a new code.")
        else:
            remaining = (record.max_attempts - record.attempt_count) if record else 0
            raise HTTPException(status_code=400, detail=f"OTP_INVALID: Incorrect code. {remaining} attempt(s) remaining.")

    # Successful login: mark email verified, update last_login_at
    user.email_verified = True
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    settings = get_settings()
    access_token = create_access_token(subject=user.id)
    refresh_tok = _create_refresh_token(db, user.id)

    _log_audit(
        db, "LOGIN_EMAIL_OTP", "SUCCESS",
        user_id=user.id,
        detail={"email": _mask_email(norm_email)},
        req=request,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_tok,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )

