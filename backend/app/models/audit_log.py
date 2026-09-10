"""
Audit log model — immutable append-only record of every significant action.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    device_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # Examples: LOGIN, VOICE_ENROLLED, VOICE_ANALYZED, COMMAND_EXECUTED,
    #           COMMAND_BLOCKED, APPROVAL_GRANTED, DEVICE_REGISTERED,
    #           VOICE_PROFILE_DELETED, INCIDENT_CREATED

    result: Mapped[str] = mapped_column(String(40), nullable=False)          # SUCCESS / FAILURE / BLOCKED
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)          # JSON extra context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamp is immutable — no onupdate
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # Relationship (read-only, no cascade delete — logs must outlive users)
    user: Mapped["User | None"] = relationship("User", back_populates="audit_logs")  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id!r} action={self.action!r} result={self.result!r}>"
