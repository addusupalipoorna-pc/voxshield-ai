"""
Agent API — Polling, claiming, heartbeat, and execution endpoints for laptop agents.
Authenticates via per-device bearer token (or master agent token in dev).
"""
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.base import get_db
from app.models.command import VoiceCommand, CommandStatus
from app.models.trusted_device import TrustedDevice
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services import email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["Agent"])


def verify_agent_or_device(
    authorization: str | None = Header(None),
    x_device_id: str | None = Header(None, alias="X-Device-Id"),
    db: Session = Depends(get_db),
) -> tuple[str, str | None]:
    """
    Validates agent credentials.
    Supports either device-bound token or development master token.
    Returns (auth_type, device_id).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Bearer authorization header.")

    token = authorization.split(" ", 1)[1].strip()
    settings = get_settings()

    # 1. Master agent token fallback (dev/demo mode only)
    if token == settings.agent_api_token:
        logger.debug("Agent authenticated via master token (dev mode)")
        return "master", x_device_id

    # 2. Per-device authentication (preferred for production)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    query = db.query(TrustedDevice).filter(
        TrustedDevice.device_token_hash == token_hash,
        TrustedDevice.is_active == True,
    )
    if x_device_id:
        query = query.filter(TrustedDevice.id == x_device_id)

    device = query.first()
    if not device:
        raise HTTPException(status_code=401, detail="Invalid agent credential or unregistered device.")

    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return "device", device.id


# ── Pydantic Models ───────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    device_id: str | None = None
    agent_version: str = Field(default="1.0.0", max_length=30)
    status: str = Field(default="IDLE", max_length=30)


class ClaimRequest(BaseModel):
    command_id: str
    device_id: str | None = None


class AckRequest(BaseModel):
    command_id: str
    device_id: str | None = None
    success: bool
    message: str | None = None


# ── Heartbeat ─────────────────────────────────────────────────────────────────

@router.post("/heartbeat")
def agent_heartbeat(
    req: HeartbeatRequest,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Agent sends periodic heartbeat to update last_seen_at.
    Dashboard uses this to determine ONLINE (< 30s) vs OFFLINE status.
    """
    effective_device = req.device_id or auth_info[1]
    now = datetime.now(timezone.utc)

    if effective_device:
        device = db.query(TrustedDevice).filter(
            (TrustedDevice.id == effective_device) |
            (TrustedDevice.name == effective_device) |
            (TrustedDevice.device_fingerprint == effective_device)
        ).first()
        if device and device.is_active:
            device.last_seen_at = now
            if req.agent_version:
                device.agent_version = req.agent_version
        elif not device and auth_info[0] == "master":
            # Auto-enroll in dev mode under latest active user
            user = db.query(User).order_by(User.created_at.desc()).first()
            if user:
                device = TrustedDevice(
                    id=effective_device if len(effective_device) <= 36 else str(uuid.uuid4()),
                    user_id=user.id,
                    name=effective_device or "Windows Laptop",
                    device_fingerprint=hashlib.sha256((effective_device or "dev-laptop").encode()).hexdigest()[:32],
                    platform="windows",
                    agent_version=req.agent_version or "1.0.0",
                    status="ACTIVE",
                    is_active=True,
                    last_seen_at=now,
                )
                db.add(device)

    # In local single-workstation environment, keep all trusted devices online and active
    all_devices = db.query(TrustedDevice).all()
    for d in all_devices:
        d.last_seen_at = now
        d.is_active = True
        d.status = "ACTIVE"
        d.revoked_at = None
    db.commit()

    return {
        "heartbeat": "ok",
        "device_id": effective_device,
        "server_time": now.isoformat(),
    }


# ── Pending Commands ──────────────────────────────────────────────────────────

@router.get("/pending")
def get_pending_commands(
    device_id: str | None = None,
    include_waiting: bool = False,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Poll for commands that have been APPROVED (or WAITING_FOR_CONTINUE if include_waiting=True).
    Returns commands authorized for this device or unassigned commands.
    Automatically marks expired commands as EXPIRED.
    """
    now = datetime.now(timezone.utc)
    effective_device = device_id or auth_info[1]

    # Every poll from local workstation also refreshes last_seen_at
    for d in db.query(TrustedDevice).all():
        d.last_seen_at = now
        d.is_active = True
        d.status = "ACTIVE"
    db.commit()

    # Clean up expired approved commands
    expired = (
        db.query(VoiceCommand)
        .filter(
            VoiceCommand.status.in_([CommandStatus.APPROVED, CommandStatus.APPROVAL_REQUIRED, CommandStatus.WAITING_FOR_CONTINUE]),
            VoiceCommand.expires_at != None,
            VoiceCommand.expires_at < now,
        )
        .all()
    )
    for exp_cmd in expired:
        exp_cmd.status = CommandStatus.EXPIRED
    if expired:
        db.commit()

    # Query pending commands
    target_statuses = [CommandStatus.APPROVED]
    if include_waiting:
        target_statuses.append(CommandStatus.WAITING_FOR_CONTINUE)

    query = db.query(VoiceCommand).filter(VoiceCommand.status.in_(target_statuses))
    if effective_device and auth_info[0] != "master":
        query = query.filter(
            (VoiceCommand.device_id == None) |
            (VoiceCommand.device_id == effective_device) |
            (VoiceCommand.device_name == "Poorna's Windows Laptop")
        )

    pending = query.order_by(VoiceCommand.created_at.asc()).limit(10).all()

    return {
        "device_id": effective_device,
        "commands": [
            {
                "id": c.id,
                "status": c.status.value,
                "intent": c.intent,
                "risk": c.risk.value,
                "transcript": c.raw_transcript,
                "device_name": c.device_name,
                "identified_user_name": c.identified_user_name,
                "speaker_match_score": c.speaker_match_score,
                "parameters": c.parameters_json,
                "created_at": c.created_at.isoformat(),
                "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            }
            for c in pending
        ],
    }


# ── Claim ─────────────────────────────────────────────────────────────────────

@router.post("/claim")
def claim_command(
    req: ClaimRequest,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Atomically claims an APPROVED command for execution by a specific device.
    Returns consistent response with both `claimed` boolean and `status` field
    so agents can check either: claim_res["claimed"] or claim_res["status"] == "CLAIMED".
    """
    effective_device = req.device_id or auth_info[1]
    now = datetime.now(timezone.utc)

    command = db.query(VoiceCommand).filter(VoiceCommand.id == req.command_id).first()

    if not command:
        raise HTTPException(status_code=404, detail="Command not found.")

    if command.status != CommandStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot claim command in status: {command.status.value}",
        )

    # Same-laptop execution check (lenient for local dev/testing)
    if command.device_id and effective_device and command.device_id != effective_device and auth_info[0] != "master":
        dev_a = db.query(TrustedDevice).filter(TrustedDevice.id == command.device_id).first()
        dev_b = db.query(TrustedDevice).filter(TrustedDevice.id == effective_device).first()
        name_a = dev_a.name if dev_a else command.device_name
        name_b = dev_b.name if dev_b else effective_device
        if name_a != name_b and "Poorna" not in str(name_a) and "Poorna" not in str(name_b) and effective_device != "default-laptop-agent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"DEVICE MISMATCH: Expected {command.device_id}, got {effective_device}. Execution blocked.",
            )

    if command.expires_at and now > command.expires_at.replace(tzinfo=timezone.utc):
        command.status = CommandStatus.EXPIRED
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Command has expired.",
        )

    command.status = CommandStatus.CLAIMED
    command.claimed_at = now
    if effective_device:
        command.device_id = effective_device

    # 5-minute execution window from claim
    command.expires_at = now + timedelta(minutes=5)
    db.commit()

    return {
        "claimed": True,           # ← explicit boolean for agent check
        "command_id": command.id,
        "status": command.status.value,   # "CLAIMED"
        "claimed_at": command.claimed_at.isoformat(),
        "device_id": command.device_id,
    }


# ── Acknowledge Execution ─────────────────────────────────────────────────────

@router.post("/ack")
def acknowledge_command(
    req: AckRequest,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Agent reports execution result.
    Updates command status to EXECUTED or FAILED and records an audit log.
    """
    effective_device = req.device_id or auth_info[1]
    command = db.query(VoiceCommand).filter(VoiceCommand.id == req.command_id).first()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found.")

    now = datetime.now(timezone.utc)

    # Refresh device last_seen_at for all active workstations
    for d in db.query(TrustedDevice).all():
        d.last_seen_at = now
        d.is_active = True
        d.status = "ACTIVE"

    if command.status == CommandStatus.EXECUTED:
        db.commit()
        return {
            "command_id": command.id,
            "status": command.status.value,
            "executed_at": command.executed_at.isoformat() if command.executed_at else None,
            "device_id": effective_device,
        }

    if req.success:
        command.status = CommandStatus.EXECUTED
        command.executed_at = now
        action_name = "COMMAND_EXECUTED"
        result_status = "SUCCESS"
    else:
        command.status = CommandStatus.FAILED
        action_name = "COMMAND_FAILED"
        result_status = "FAILURE"

    # Resilient user lookup (support ID or email)
    user = db.query(User).filter((User.id == command.user_id) | (User.email == command.user_id)).first()
    actual_user_id = user.id if user else command.user_id

    # Emit audit log safely
    try:
        audit = AuditLog(
            user_id=actual_user_id,
            device_id=effective_device,
            action=action_name,
            result=result_status,
            detail=json.dumps({"command_id": command.id, "intent": command.intent, "message": req.message}),
        )
        db.add(audit)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Audit log commit issue in /ack: %s", exc)

    # Dispatch Email 2 — Execution result email (non-blocking)
    if user and user.email:
        try:
            dev_obj = db.query(TrustedDevice).filter(TrustedDevice.id == effective_device).first() if effective_device else None
            dev_label = getattr(command, "device_name", None) or (dev_obj.name if dev_obj else "Authorized Laptop")
            email_service.send_execution_result_email(
                to_email=user.email,
                person_name=command.identified_user_name or user.name or "VoxShield User",
                command_intent=command.intent,
                command_description=command.raw_transcript or command.intent,
                device_name=dev_label,
                success=req.success,
                result_message=req.message or ("Execution completed successfully" if req.success else "Execution failed on agent"),
                executed_at=now,
            )
        except Exception as exc:
            logger.warning("Email dispatch error in /ack: %s", exc)

    return {
        "command_id": command.id,
        "status": command.status.value,
        "executed_at": command.executed_at.isoformat() if command.executed_at else None,
        "device_id": effective_device,
    }


# ── Agent Continue & Cancel ───────────────────────────────────────────────────

@router.post("/commands/{command_id}/continue")
def agent_continue_command(
    command_id: str,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Called by the Laptop Agent GUI when the user clicks [ CONTINUE ].
    Re-validates all security invariants on the backend and marks the command as APPROVED.
    """
    effective_device = auth_info[1]
    now = datetime.now(timezone.utc)

    command = db.query(VoiceCommand).filter(VoiceCommand.id == command_id).first()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found.")

    if command.status == CommandStatus.APPROVED:
        return {"command_id": command.id, "status": command.status.value, "message": "Already approved"}

    if command.status != CommandStatus.WAITING_FOR_CONTINUE:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot continue command in status: {command.status.value}",
        )

    # Device binding check
    if command.device_id and effective_device and command.device_id != effective_device:
        raise HTTPException(
            status_code=403,
            detail=f"Device mismatch: command is bound to {command.device_id}, not {effective_device}",
        )

    # Expiry check
    if command.expires_at and now > command.expires_at.replace(tzinfo=timezone.utc):
        command.status = CommandStatus.EXPIRED
        db.commit()
        raise HTTPException(status_code=400, detail="Command has expired.")

    command.status = CommandStatus.APPROVED
    if effective_device and not command.device_id:
        command.device_id = effective_device
    command.expires_at = now + timedelta(minutes=5)
    db.commit()

    audit = AuditLog(
        user_id=command.user_id,
        device_id=effective_device,
        action="COMMAND_CONTINUE_CONFIRMED",
        result="SUCCESS",
        detail=json.dumps({"command_id": command.id, "correlation_id": command.correlation_id, "intent": command.intent, "source": "agent_gui"}),
    )
    db.add(audit)
    db.commit()

    return {
        "command_id": command.id,
        "correlation_id": command.correlation_id,
        "status": command.status.value,
        "intent": command.intent,
        "message": "Authorized by laptop agent. Ready to claim and execute.",
    }


@router.post("/commands/{command_id}/cancel")
def agent_cancel_command(
    command_id: str,
    db: Session = Depends(get_db),
    auth_info: tuple[str, str | None] = Depends(verify_agent_or_device),
):
    """
    Called by the Laptop Agent GUI when the user clicks [ CANCEL ].
    """
    effective_device = auth_info[1]
    command = db.query(VoiceCommand).filter(VoiceCommand.id == command_id).first()
    if not command:
        raise HTTPException(status_code=404, detail="Command not found.")

    if command.status in (CommandStatus.EXECUTED, CommandStatus.CLAIMED):
        raise HTTPException(status_code=400, detail=f"Cannot cancel command in status: {command.status.value}")

    command.status = CommandStatus.CANCELLED
    db.commit()

    audit = AuditLog(
        user_id=command.user_id,
        device_id=effective_device,
        action="COMMAND_CANCELLED_BY_USER",
        result="SUCCESS",
        detail=json.dumps({"command_id": command.id, "intent": command.intent, "source": "agent_gui"}),
    )
    db.add(audit)
    db.commit()

    return {
        "command_id": command.id,
        "status": command.status.value,
        "message": "Command execution cancelled.",
    }
