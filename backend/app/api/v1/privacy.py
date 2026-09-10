"""
Privacy Center API — User data export, analysis history deletion, and privacy compliance.
"""
from datetime import datetime, timezone
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, _log_audit
from app.db.base import get_db
from app.models.user import User
from app.models.speaker_profile import SpeakerProfile, VoiceSampleMetadata
from app.models.voice_analysis import VoiceAnalysis
from app.models.command import VoiceCommand
from app.models.audit_log import AuditLog
from app.models.trusted_device import TrustedDevice

router = APIRouter(prefix="/api/v1/privacy", tags=["Privacy"])


@router.get("/export")
def export_user_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Export all personal data, voice profile metadata, analysis history,
    and commands for the authenticated user in standard JSON format.
    Never exports password hashes, secret keys, or raw JWTs.
    """
    # 1. Profile
    profile = db.query(SpeakerProfile).filter(
        SpeakerProfile.user_id == current_user.id,
        SpeakerProfile.is_active == True,
    ).first()

    profile_data = None
    if profile:
        samples = db.query(VoiceSampleMetadata).filter(VoiceSampleMetadata.profile_id == profile.id).all()
        profile_data = {
            "profile_id": profile.id,
            "name": profile.name,
            "model_version": profile.model_version,
            "samples_count": profile.samples_count,
            "quality_score": profile.quality_score,
            "created_at": profile.created_at.isoformat(),
            "samples": [
                {
                    "sample_index": s.sample_index,
                    "duration_ms": s.duration_ms,
                    "captured_at": s.captured_at.isoformat(),
                }
                for s in samples
            ],
        }

    # 2. Voice Analyses
    analyses = db.query(VoiceAnalysis).filter(VoiceAnalysis.user_id == current_user.id).all()
    analyses_data = [
        {
            "analysis_id": a.id,
            "status": a.status.value,
            "created_at": a.created_at.isoformat(),
            "duration_ms": a.duration_ms,
            "sample_rate": a.sample_rate,
            "audio_hash": a.audio_hash,
            "risk_level": a.risk_score.risk_level if a.risk_score else None,
            "risk_score": a.risk_score.total_score if a.risk_score else None,
            "decision": a.risk_score.decision if a.risk_score else None,
        }
        for a in analyses
    ]

    # 3. Commands
    commands = db.query(VoiceCommand).filter(VoiceCommand.user_id == current_user.id).all()
    commands_data = [
        {
            "command_id": c.id,
            "intent": c.intent,
            "risk": c.risk.value,
            "status": c.status.value,
            "raw_transcript": c.raw_transcript,
            "created_at": c.created_at.isoformat(),
            "executed_at": c.executed_at.isoformat() if c.executed_at else None,
        }
        for c in commands
    ]

    # 4. Devices
    devices = db.query(TrustedDevice).filter(TrustedDevice.user_id == current_user.id).all()
    devices_data = [
        {
            "device_id": d.id,
            "name": d.name,
            "platform": d.platform,
            "status": d.status,
            "registered_at": d.registered_at.isoformat(),
        }
        for d in devices
    ]

    # 5. Audit logs
    logs = db.query(AuditLog).filter(AuditLog.user_id == current_user.id).order_by(AuditLog.created_at.desc()).limit(100).all()
    logs_data = [
        {
            "action": l.action,
            "result": l.result,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]

    _log_audit(db, "DATA_EXPORT", "SUCCESS", user_id=current_user.id, req=request)

    return {
        "export_metadata": {
            "user_id": current_user.id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "format": "VoxShield Privacy Dossier v1.0",
        },
        "user_account": {
            "name": current_user.name,
            "email": current_user.email,
            "phone": current_user.phone,
            "role": current_user.role.value,
            "is_verified": current_user.is_verified,
            "consent_given": current_user.consent_given,
            "consent_at": current_user.consent_at.isoformat() if current_user.consent_at else None,
            "created_at": current_user.created_at.isoformat(),
        },
        "voice_profile": profile_data,
        "analyses": analyses_data,
        "commands": commands_data,
        "trusted_devices": devices_data,
        "audit_logs": logs_data,
    }


@router.delete("/analyses")
def delete_analysis_history(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete all audio analysis records for current user."""
    count = db.query(VoiceAnalysis).filter(VoiceAnalysis.user_id == current_user.id).delete()
    db.commit()

    _log_audit(db, "ANALYSIS_HISTORY_DELETED", "SUCCESS", user_id=current_user.id, detail={"deleted_count": count}, req=request)
    return {"message": f"Deleted {count} analysis records successfully."}
