"""
Incidents API — View and manage security incidents.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.incident import Incident, IncidentStatus, AttackType
from datetime import datetime, timezone

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


class PatchIncident(BaseModel):
    status: str | None = None
    analyst_notes: str | None = None


@router.get("")
def list_incidents(
    limit: int = 50,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List incidents. Admins/Analysts see all incidents; others see their own."""
    query = db.query(Incident)
    if current_user.role not in (UserRole.ADMIN, UserRole.SECURITY_ANALYST):
        query = query.filter(Incident.user_id == current_user.id)
    if status_filter:
        query = query.filter(Incident.status == status_filter)
    incidents = query.order_by(Incident.created_at.desc()).limit(limit).all()

    return {
        "total": len(incidents),
        "incidents": [_incident_to_dict(i) for i in incidents],
    }


@router.get("/{incident_id}")
def get_incident(
    incident_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current_user.role not in (UserRole.ADMIN, UserRole.SECURITY_ANALYST) and incident.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized.")
    return _incident_to_dict(incident)


@router.patch("/{incident_id}")
def update_incident(
    incident_id: str,
    patch: PatchIncident,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update incident status and analyst notes (Security Analysts and Admins only)."""
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found.")
    if current_user.role not in (UserRole.ADMIN, UserRole.SECURITY_ANALYST):
        raise HTTPException(status_code=403, detail="Access denied: Only Security Analysts and Administrators can update incidents.")

    if patch.status:
        valid = {s.value for s in IncidentStatus}
        if patch.status not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid}")
        incident.status = patch.status
        if patch.status == "RESOLVED":
            incident.resolved_at = datetime.now(timezone.utc)

    if patch.analyst_notes is not None:
        incident.analyst_notes = patch.analyst_notes

    db.commit()
    db.refresh(incident)
    return _incident_to_dict(incident)


def _incident_to_dict(i: Incident) -> dict:
    return {
        "id": i.id,
        "user_id": i.user_id,
        "analysis_id": i.analysis_id,
        "attack_type": i.attack_type.value,
        "risk_level": i.risk_level,
        "status": i.status.value,
        "decision": i.decision,
        "summary": i.summary,
        "analyst_notes": i.analyst_notes,
        "created_at": i.created_at.isoformat(),
        "updated_at": i.updated_at.isoformat(),
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }
