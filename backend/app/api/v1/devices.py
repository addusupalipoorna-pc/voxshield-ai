"""
Trusted Devices API — Manage authorized laptop agents and workstations.
Field `device_name` is the canonical name used by frontend, agent, and API responses.
"""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import os
import secrets
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, _log_audit
from app.db.base import get_db
from app.models.user import User
from app.models.trusted_device import TrustedDevice
from app.models.otp import OTPVerification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/devices", tags=["Devices"])


class DeviceRegisterRequest(BaseModel):
    device_name: str | None = Field(default=None, min_length=2, max_length=120)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    platform: str = Field(default="windows", max_length=40)
    agent_version: str = Field(default="1.0.0", max_length=30)
    device_fingerprint: str | None = None


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_device(
    payload: DeviceRegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Register a new laptop/device for the authenticated user.
    Generates a unique device identity and single-device secret credential.
    Accepts both `device_name` (canonical) and `name` (legacy/compat).
    """
    chosen_name = payload.device_name or payload.name
    if not chosen_name:
        raise HTTPException(status_code=422, detail="device_name or name is required.")

    fingerprint = payload.device_fingerprint or secrets.token_hex(24)

    # Check for existing device with this fingerprint
    existing = db.query(TrustedDevice).filter(
        TrustedDevice.device_fingerprint == fingerprint,
        TrustedDevice.user_id == current_user.id,
    ).first()

    raw_device_token = secrets.token_urlsafe(36)
    token_hash = hashlib.sha256(raw_device_token.encode()).hexdigest()

    if existing:
        existing.name = chosen_name
        existing.platform = payload.platform
        existing.agent_version = payload.agent_version
        existing.device_token_hash = token_hash
        existing.status = "ACTIVE"
        existing.is_active = True
        existing.last_seen_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        device = existing
    else:
        device = TrustedDevice(
            user_id=current_user.id,
            name=chosen_name,
            device_fingerprint=fingerprint,
            device_token_hash=token_hash,
            platform=payload.platform,
            agent_version=payload.agent_version,
            status="ACTIVE",
            is_active=True,
            last_seen_at=datetime.now(timezone.utc),
        )
        db.add(device)
        db.commit()
        db.refresh(device)

    _log_audit(db, "DEVICE_REGISTERED", "SUCCESS", user_id=current_user.id,
               detail={"device_id": device.id, "device_name": device.name}, req=request)

    # In local development mode, automatically update agent/device_credentials.json
    try:
        agent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../agent"))
        if os.path.isdir(agent_dir):
            creds_file = os.path.join(agent_dir, "device_credentials.json")
            with open(creds_file, "w", encoding="utf-8") as f:
                json.dump({
                    "device_id": device.id,
                    "device_name": device.name,
                    "device_token": raw_device_token,
                    "platform": device.platform or "windows",
                    "registered_at": device.registered_at.isoformat() if hasattr(device.registered_at, "isoformat") else str(device.registered_at),
                }, f, indent=2)
            logger.info("Saved local agent credentials to %s", creds_file)
    except Exception as e:
        logger.warning("Could not auto-write agent/device_credentials.json: %s", e)

    return {
        "device_id": device.id,
        "id": device.id,
        "name": device.name,
        "device_name": device.name,
        "device_token": raw_device_token,
        "platform": device.platform,
        "status": device.status,
        "registered_at": device.registered_at.isoformat(),
        "message": "Device registered successfully. Save the device_token into your agent configuration.",
    }


# Constants for host enclave isolation
POORNA_EMAILS = {
    "poornachandarpc897@gmail.com",
    "addusupalipoorna@gmail.com",
    "poornachandaraddusupali@gmail.com",
}
POORNA_PHONE = "+919392127166"
POORNA_DEVICE_ID = "50a4787c-0171-4b35-b66f-d77a1405c305"

# Active delegated guest authorizations: user_id -> expiration datetime
AUTHORIZED_GUEST_ACCESS: dict[str, datetime] = {}


@router.get("")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List trusted devices.
    Zero-Trust Security Contract:
    - Poorna (the host enclave owner) always sees their active Windows Laptop enclave.
    - Friends and third-party users DO NOT see Poorna's laptop name or ID by default.
    - Friends only see devices that they have personally registered.
    - If a friend requests and verifies access via OTP sent to Poorna's phone number or email,
      the host enclave is temporarily unlocked for their session.
    """
    now = datetime.now(timezone.utc)
    is_poorna = (
        (current_user.email and current_user.email.lower() in POORNA_EMAILS)
        or current_user.id == "42415f60-8a9f-4893-9192-c39b4fe86b88"
        or (current_user.phone and "7166" in current_user.phone)
    )

    devices = []
    has_host_access = is_poorna

    if is_poorna:
        # Poorna always owns and sees Poorna's Windows Laptop
        poorna_dev = db.query(TrustedDevice).filter(TrustedDevice.id == POORNA_DEVICE_ID).first()
        if poorna_dev:
            poorna_dev.user_id = current_user.id
            poorna_dev.last_seen_at = now
            poorna_dev.is_active = True
            poorna_dev.status = "ACTIVE"
            db.commit()
            devices = [poorna_dev]
        else:
            devices = db.query(TrustedDevice).filter(TrustedDevice.user_id == current_user.id).all()
    else:
        # Friend: only their personal devices
        user_devices = db.query(TrustedDevice).filter(TrustedDevice.user_id == current_user.id).all()
        devices = list(user_devices)

        # Check if friend has active delegated access granted via OTP
        if current_user.id in AUTHORIZED_GUEST_ACCESS and AUTHORIZED_GUEST_ACCESS[current_user.id] > now:
            has_host_access = True
            poorna_dev = db.query(TrustedDevice).filter(TrustedDevice.id == POORNA_DEVICE_ID).first()
            if poorna_dev and poorna_dev.is_active:
                devices.append(poorna_dev)

    # Touch heartbeat for online display
    for d in devices:
        if d.is_active and d.status == "ACTIVE":
            d.last_seen_at = now
    db.commit()

    def _to_utc_iso(dt: datetime | None) -> str | None:
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    return {
        "devices": [
            {
                "id": d.id,
                "device_id": d.id,
                "name": d.name if (is_poorna or d.user_id == current_user.id) else "Poorna's Windows Laptop (Guest Authorized)",
                "device_name": d.name if (is_poorna or d.user_id == current_user.id) else "Poorna's Windows Laptop (Guest Authorized)",
                "platform": d.platform,
                "agent_version": d.agent_version,
                "status": d.status,
                "is_active": d.is_active,
                "is_host_enclave": (d.id == POORNA_DEVICE_ID),
                "is_delegated": (not is_poorna and d.id == POORNA_DEVICE_ID),
                "last_seen_at": _to_utc_iso(d.last_seen_at),
                "registered_at": _to_utc_iso(d.registered_at),
            }
            for d in devices
        ],
        "is_host_owner": is_poorna,
        "has_host_access": has_host_access,
        "host_available": True,
        "owner_phone_masked": "+91 ******7166",
        "owner_email_masked": "p******@gmail.com",
    }


@router.post("/request-host-access")
def request_host_access(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Called by a friend to request authorization to execute on Poorna's laptop enclave.
    Generates an OTP and dispatches it directly to Poorna's phone (+91 9392127166) and email.
    """
    now = datetime.now(timezone.utc)
    raw_code = f"{secrets.randbelow(900000) + 100000:06d}"
    code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
    expires_at = now + timedelta(minutes=5)
    req_id = f"host_access_{uuid.uuid4().hex[:16]}"

    # Invalidate previous unused host access OTPs
    db.query(OTPVerification).filter(
        OTPVerification.purpose == "HOST_ACCESS",
        OTPVerification.used_at.is_(None),
    ).delete()

    otp_rec = OTPVerification(
        user_id=current_user.id,
        channel="PHONE",
        purpose="HOST_ACCESS",
        destination=POORNA_PHONE,
        otp_hash=code_hash,
        expires_at=expires_at,
        request_id=req_id,
    )
    db.add(otp_rec)
    db.commit()

    # 1. Dispatch SMS to Poorna's real mobile phone
    from app.services.sms_service import get_sms_provider
    sms_prov = get_sms_provider()
    msg = f"VoxShield Host Alert: {current_user.name or current_user.email} is requesting remote access to your laptop enclave. Authorization code: {raw_code}. Valid for 5 min."
    sms_sent = sms_prov.send_sms(to_phone=POORNA_PHONE, message=msg, otp_code=raw_code)

    # 2. Dispatch Email to Poorna's email
    from app.services.email_service import send_otp_email
    email_sent = send_otp_email(
        to_email="poornachandarpc897@gmail.com",
        user_name="Poorna",
        otp_code=raw_code,
        command_intent=f"Authorize Host Laptop Access for {current_user.email}",
        expires_minutes=5,
    )

    _log_audit(db, "HOST_ACCESS_REQUESTED", "SUCCESS", user_id=current_user.id,
               detail={"requester": current_user.email, "sms_sent": sms_sent, "email_sent": email_sent}, req=request)

    banner = f"""
======================================================================
[VOXSHIELD HOST ENCLAVE ACCESS OTP CHALLENGE]
Requester: {current_user.email}
Target: Poorna's Windows Laptop Enclave
OTP Code: {raw_code}
Dispatched To: Poorna's Phone (+91 9392127166) & poornachandarpc897@gmail.com
Expires in: 5 minutes
======================================================================
"""
    logger.info(banner)
    print(banner, flush=True)

    return {
        "status": "OTP_SENT",
        "message": "Verification code dispatched to Poorna's phone (+91 ******7166) and email.",
        "owner_phone_masked": "+91 ******7166",
        "owner_email_masked": "poo******@gmail.com",
        "expires_in_seconds": 300,
        "demo_code": raw_code if (not sms_sent and not email_sent) else None,
    }


class VerifyHostAccessRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


@router.post("/verify-host-access")
def verify_host_access(
    payload: VerifyHostAccessRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Verify the 6-digit OTP code provided by Poorna to grant friend access.
    """
    now = datetime.now(timezone.utc)
    code_hash = hashlib.sha256(payload.code.strip().encode("utf-8")).hexdigest()

    otp_rec = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.purpose == "HOST_ACCESS",
            OTPVerification.otp_hash == code_hash,
            OTPVerification.used_at.is_(None),
            OTPVerification.expires_at > now,
        )
        .first()
    )

    if not otp_rec:
        _log_audit(db, "HOST_ACCESS_VERIFY_FAILED", "FAILURE", user_id=current_user.id,
                   detail={"requester": current_user.email}, req=request)
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired verification code. Access to Poorna's laptop was denied."
        )

    # Mark OTP as used
    otp_rec.used_at = now
    # Grant 12 hours of authorized guest access
    AUTHORIZED_GUEST_ACCESS[current_user.id] = now + timedelta(hours=12)
    db.commit()

    _log_audit(db, "HOST_ACCESS_GRANTED", "SUCCESS", user_id=current_user.id,
               detail={"requester": current_user.email, "granted_by": "Poorna"}, req=request)

    return {
        "success": True,
        "message": "Host enclave access verified and granted by Poorna! You may now execute voice commands on Poorna's laptop.",
        "host_enclave_unlocked": True,
        "device_name": "Poorna's Windows Laptop",
    }


@router.delete("/{device_id}")
@router.post("/{device_id}/revoke")
def revoke_device(
    device_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a trusted device authorization."""
    device = db.query(TrustedDevice).filter(
        TrustedDevice.id == device_id,
        TrustedDevice.user_id == current_user.id,
    ).first()

    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")

    device.is_active = False
    device.status = "REVOKED"
    device.revoked_at = datetime.now(timezone.utc)
    db.commit()

    _log_audit(db, "DEVICE_REVOKED", "SUCCESS", user_id=current_user.id,
               detail={"device_id": device.id, "device_name": device.name}, req=request)
    return {"message": "Device revoked successfully.", "device_id": device_id}
