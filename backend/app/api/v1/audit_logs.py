"""
Audit Logs and Admin Management API — Immutable audit history and user administration.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, require_role
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog
from app.schemas.user import UserOut

router = APIRouter(prefix="/api/v1", tags=["Audit & Admin"])


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = Query(default=100, le=500),
    action: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.SECURITY_ANALYST])),
):
    """Retrieve immutable security audit trail (Admins and Security Analysts only)."""
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.created_at.desc()).limit(limit).all()

    return {
        "total": len(logs),
        "audit_logs": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "device_id": l.device_id,
                "action": l.action,
                "result": l.result,
                "detail": l.detail,
                "ip_address": l.ip_address,
                "user_agent": l.user_agent,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }


@router.get("/admin/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN])),
):
    """List real registered users from database (Administrators only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    user_list = [UserOut.model_validate(u).model_dump(mode="json") for u in users]
    return {"users": user_list, "total": len(user_list)}
