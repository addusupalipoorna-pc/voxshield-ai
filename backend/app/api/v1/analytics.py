"""
Analytics API — Aggregated stats for dashboard and charts.
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.v1.auth import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.models.voice_analysis import VoiceAnalysis, AnalysisStatus
from app.models.incident import Incident
from app.models.command import VoiceCommand, CommandStatus
from app.models.speaker_profile import SpeakerProfile

router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregated security metrics for the dashboard."""
    is_admin = current_user.role in ("admin", "analyst")

    def user_filter(query, model):
        if is_admin:
            return query
        return query.filter(model.user_id == current_user.id)

    now = datetime.now(timezone.utc)
    twenty_four_h = now - timedelta(hours=24)
    seven_days = now - timedelta(days=7)

    # Total analyses
    total_analyses = user_filter(
        db.query(func.count(VoiceAnalysis.id)), VoiceAnalysis
    ).scalar() or 0

    analyses_24h = user_filter(
        db.query(func.count(VoiceAnalysis.id)), VoiceAnalysis
    ).filter(VoiceAnalysis.created_at >= twenty_four_h).scalar() or 0

    # Incidents
    total_incidents = user_filter(
        db.query(func.count(Incident.id)), Incident
    ).scalar() or 0

    open_incidents = user_filter(
        db.query(func.count(Incident.id)), Incident
    ).filter(Incident.status == "NEW").scalar() or 0

    critical_incidents = user_filter(
        db.query(func.count(Incident.id)), Incident
    ).filter(Incident.risk_level == "CRITICAL").scalar() or 0

    blocked_24h = user_filter(
        db.query(func.count(Incident.id)), Incident
    ).filter(
        Incident.decision == "BLOCK",
        Incident.created_at >= twenty_four_h,
    ).scalar() or 0

    # Attack type breakdown
    attack_counts = {}
    if is_admin:
        rows = db.query(
            Incident.attack_type, func.count(Incident.id)
        ).group_by(Incident.attack_type).all()
    else:
        rows = db.query(
            Incident.attack_type, func.count(Incident.id)
        ).filter(Incident.user_id == current_user.id).group_by(Incident.attack_type).all()

    for attack_type, count in rows:
        attack_counts[str(attack_type.value if hasattr(attack_type, 'value') else attack_type)] = count

    # Commands
    total_commands = user_filter(
        db.query(func.count(VoiceCommand.id)), VoiceCommand
    ).scalar() or 0

    executed_commands = user_filter(
        db.query(func.count(VoiceCommand.id)), VoiceCommand
    ).filter(VoiceCommand.status == "EXECUTED").scalar() or 0

    blocked_commands = user_filter(
        db.query(func.count(VoiceCommand.id)), VoiceCommand
    ).filter(VoiceCommand.status == "BLOCKED").scalar() or 0

    # Speaker profile
    has_profile = db.query(SpeakerProfile).filter(
        SpeakerProfile.user_id == current_user.id,
        SpeakerProfile.is_active == True,
        SpeakerProfile.deleted_at == None,
    ).first() is not None

    # Risk level breakdown
    risk_breakdown = {}
    if is_admin:
        risk_rows = db.query(Incident.risk_level, func.count(Incident.id)).group_by(Incident.risk_level).all()
    else:
        risk_rows = db.query(Incident.risk_level, func.count(Incident.id)).filter(
            Incident.user_id == current_user.id
        ).group_by(Incident.risk_level).all()

    for risk_level, count in risk_rows:
        risk_breakdown[str(risk_level)] = count

    # Total users (admin only)
    total_users = None
    if is_admin:
        from app.models.user import User as UserModel
        total_users = db.query(func.count(UserModel.id)).scalar() or 0

    return {
        "analyses": {
            "total": total_analyses,
            "last_24h": analyses_24h,
        },
        "incidents": {
            "total": total_incidents,
            "open": open_incidents,
            "critical": critical_incidents,
            "blocked_24h": blocked_24h,
            "by_attack_type": attack_counts,
            "by_risk_level": risk_breakdown,
        },
        "commands": {
            "total": total_commands,
            "executed": executed_commands,
            "blocked": blocked_commands,
        },
        "profile": {
            "enrolled": has_profile,
        },
        "users": {
            "total": total_users,
        },
    }


@router.get("/timeline")
def get_timeline(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Incident and analysis counts per day for the last N days."""
    is_admin = current_user.role in ("admin", "analyst")
    now = datetime.now(timezone.utc)
    result = []

    for d in range(days - 1, -1, -1):
        day_start = (now - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        date_str = day_start.strftime("%Y-%m-%d")

        inc_q = db.query(func.count(Incident.id)).filter(
            Incident.created_at >= day_start,
            Incident.created_at < day_end,
        )
        if not is_admin:
            inc_q = inc_q.filter(Incident.user_id == current_user.id)
        incident_count = inc_q.scalar() or 0

        an_q = db.query(func.count(VoiceAnalysis.id)).filter(
            VoiceAnalysis.created_at >= day_start,
            VoiceAnalysis.created_at < day_end,
        )
        if not is_admin:
            an_q = an_q.filter(VoiceAnalysis.user_id == current_user.id)
        analysis_count = an_q.scalar() or 0

        blocked_q = db.query(func.count(Incident.id)).filter(
            Incident.created_at >= day_start,
            Incident.created_at < day_end,
            Incident.decision == "BLOCK",
        )
        if not is_admin:
            blocked_q = blocked_q.filter(Incident.user_id == current_user.id)
        blocked_count = blocked_q.scalar() or 0

        result.append({
            "date": date_str,
            "analyses": analysis_count,
            "incidents": incident_count,
            "blocked": blocked_count,
        })

    return {"days": days, "timeline": result}
