"""
Voice command, approval, and OTP models.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum


class CommandRisk(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class CommandStatus(str, enum.Enum):
    PENDING = "PENDING"
    WAITING_FOR_CONTINUE = "WAITING_FOR_CONTINUE"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    WAITING_FOR_APPROVAL = "APPROVAL_REQUIRED"
    APPROVED = "APPROVED"
    CLAIMED = "CLAIMED"
    EXECUTING = "EXECUTING"
    EXECUTED = "EXECUTED"
    BLOCKED = "BLOCKED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"


class VoiceCommand(Base):
    __tablename__ = "voice_commands"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("voice_analyses.id"), nullable=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("trusted_devices.id"), nullable=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)

    # 1:N Speaker Identification result
    identified_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    identified_user_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    speaker_match_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    raw_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    intent: Mapped[str] = mapped_column(String(80), nullable=False)        # e.g. OPEN_WHATSAPP
    risk: Mapped[CommandRisk] = mapped_column(Enum(CommandRisk), nullable=False, default=CommandRisk.LOW)
    parameters_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    status: Mapped[CommandStatus] = mapped_column(Enum(CommandStatus), nullable=False, default=CommandStatus.PENDING)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    analysis: Mapped["VoiceAnalysis"] = relationship("VoiceAnalysis", back_populates="commands")  # type: ignore[name-defined]
    approval: Mapped["CommandApproval | None"] = relationship("CommandApproval", back_populates="command", uselist=False)
    otp_records: Mapped[list["CommandOTP"]] = relationship("CommandOTP", back_populates="command", cascade="all, delete-orphan")


class CommandApproval(Base):
    """
    Short-lived, single-use, user+command bound approval token.
    Stores only the SHA-256 hash of the token — raw token is sent to user only once.
    """
    __tablename__ = "command_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    command_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_commands.id", ondelete="CASCADE"), nullable=False, unique=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("trusted_devices.id"), nullable=True)

    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    approved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)   # APPROVED / REJECTED

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    command: Mapped["VoiceCommand"] = relationship("VoiceCommand", back_populates="approval")


class CommandOTP(Base):
    """
    Short-lived, single-use numeric OTP for secondary verification of high-risk commands.
    NEVER stores the raw OTP code — stores only the SHA-256 hash.
    Rate-limited by attempt_count.
    """
    __tablename__ = "command_otps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    command_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_commands.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)   # SHA-256 of the OTP digits
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    command: Mapped["VoiceCommand"] = relationship("VoiceCommand", back_populates="otp_records")
