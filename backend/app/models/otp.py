"""
OTP Verification model for real Phone and Email verification.
Never stores plaintext OTPs — only cryptographic hashes with purpose and destination binding.
"""
import enum
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class OTPChannel(str, enum.Enum):
    EMAIL = "EMAIL"
    PHONE = "PHONE"


class OTPPurpose(str, enum.Enum):
    REGISTRATION = "REGISTRATION"
    LOGIN = "LOGIN"
    PASSWORD_RESET = "PASSWORD_RESET"
    COMMAND_APPROVAL = "COMMAND_APPROVAL"
    SENSITIVE_ACTION = "SENSITIVE_ACTION"


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )

    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # EMAIL / PHONE
    purpose: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # REGISTRATION / LOGIN / etc.
    destination: Mapped[str] = mapped_column(String(255), nullable=False, index=True)  # E.164 phone or email
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)

    # Relationship to user
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # type: ignore[name-defined]

    def __repr__(self) -> str:
        return f"<OTPVerification id={self.id!r} channel={self.channel} purpose={self.purpose} destination={self.destination}>"
