"""
User model — authentication, roles, profile.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum


class UserRole(str, enum.Enum):
    USER = "USER"
    SECURITY_ANALYST = "SECURITY_ANALYST"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.USER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_otp_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone_otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_otp_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    identity_status: Mapped[str] = mapped_column(String(30), nullable=False, default="INCOMPLETE")
    consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def email_verified(self) -> bool:
        return self.is_verified

    @email_verified.setter
    def email_verified(self, value: bool) -> None:
        self.is_verified = value

    # Relationships
    speaker_profiles: Mapped[list["SpeakerProfile"]] = relationship(  # type: ignore[name-defined]
        "SpeakerProfile", back_populates="user", cascade="all, delete-orphan"
    )
    voice_analyses: Mapped[list["VoiceAnalysis"]] = relationship(  # type: ignore[name-defined]
        "VoiceAnalysis", back_populates="user", cascade="all, delete-orphan"
    )
    trusted_devices: Mapped[list["TrustedDevice"]] = relationship(  # type: ignore[name-defined]
        "TrustedDevice", back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(  # type: ignore[name-defined]
        "AuditLog", back_populates="user"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!r} email={self.email!r} role={self.role}>"
