"""
Incident model — auto-created on deepfake detection, speaker mismatch,
replay attack, critical block, or suspicious high-risk attempt.
"""
import uuid
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum


class IncidentSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class IncidentStatus(str, enum.Enum):
    NEW = "NEW"
    INVESTIGATING = "INVESTIGATING"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


class AttackType(str, enum.Enum):
    AI_VOICE = "AI_VOICE"
    SPEAKER_MISMATCH = "SPEAKER_MISMATCH"
    REPLAY_ATTACK = "REPLAY_ATTACK"
    CRITICAL_COMMAND_BLOCKED = "CRITICAL_COMMAND_BLOCKED"
    SUSPICIOUS_PATTERN = "SUSPICIOUS_PATTERN"
    UNKNOWN = "UNKNOWN"


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    analysis_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("voice_analyses.id"), nullable=True)
    command_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("voice_commands.id"), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("trusted_devices.id"), nullable=True)

    attack_type: Mapped[AttackType] = mapped_column(Enum(AttackType), nullable=False, default=AttackType.UNKNOWN)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="HIGH")      # CAUTION/HIGH/CRITICAL
    status: Mapped[IncidentStatus] = mapped_column(Enum(IncidentStatus), nullable=False, default=IncidentStatus.NEW)
    decision: Mapped[str | None] = mapped_column(String(30), nullable=True)  # ALLOW/BLOCK/VERIFY
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def severity(self) -> IncidentSeverity:
        try:
            return IncidentSeverity(self.risk_level)
        except Exception:
            return IncidentSeverity.HIGH

    @severity.setter
    def severity(self, value: IncidentSeverity | str) -> None:
        if hasattr(value, "value"):
            self.risk_level = value.value
        else:
            self.risk_level = str(value)

    @property
    def description(self) -> str | None:
        return self.summary

    @description.setter
    def description(self, value: str | None) -> None:
        self.summary = value

    def __repr__(self) -> str:
        return f"<Incident id={self.id!r} type={self.attack_type} status={self.status}>"
