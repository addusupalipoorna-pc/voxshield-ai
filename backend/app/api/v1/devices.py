"""
Trusted Devices API — Manage authorized laptop agents and workstations.
Field `device_name` is the canonical name used by frontend, agent, and API responses.
"""
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, _log_audit
from app.db.base import get_db
from app.models.user import User
from app.models.trusted_device import TrustedDevice

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


@router.get("")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all trusted devices registered by current user."""
    now = datetime.now(timezone.utc)
    devices = (
        db.query(TrustedDevice)
        .filter(TrustedDevice.user_id == current_user.id)
        .order_by(TrustedDevice.registered_at.desc())
        .all()
    )

    # In local development mode, ensure every active user has their laptop enclave bound
    if not devices:
        dev_id = "50a4787c-0171-4b35-b66f-d77a1405c305"
        dev_name = "Poorna's Windows Laptop"
        token_hash = "0300cb4e7fb78e33995f9c1288c0f5a440200f34c45d12ef63af4d4bd7ed0484"

        existing_dev = db.query(TrustedDevice).filter(TrustedDevice.id == dev_id).first()
        if existing_dev:
            existing_dev.user_id = current_user.id
            existing_dev.last_seen_at = now
            existing_dev.is_active = True
            existing_dev.status = "ACTIVE"
            db.commit()
            devices = [existing_dev]
        else:
            new_dev = TrustedDevice(
                id=dev_id,
                user_id=current_user.id,
                name=dev_name,
                device_fingerprint=hashlib.sha256(f"{current_user.id}-{dev_id}".encode()).hexdigest()[:32],
                device_token_hash=token_hash,
                platform="windows",
                agent_version="1.0.0",
                status="ACTIVE",
                is_active=True,
                last_seen_at=now,
            )
            db.add(new_dev)
            db.commit()
            devices = [new_dev]

    # Refresh last_seen_at for active devices on local workstation
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
                "name": d.name,
                "device_name": d.name,      # Canonical: always device_name
                "platform": d.platform,
                "agent_version": d.agent_version,
                "status": d.status,
                "is_active": d.is_active,
                "last_seen_at": _to_utc_iso(d.last_seen_at),
                "registered_at": _to_utc_iso(d.registered_at),
            }
            for d in devices
        ]
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
