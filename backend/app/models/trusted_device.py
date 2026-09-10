"""
Trusted device model — registered laptops/agents.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class TrustedDevice(Base):
    __tablename__ = "trusted_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False)           # e.g. "Ravi's Laptop"
    device_fingerprint: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    device_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    platform: Mapped[str | None] = mapped_column(String(40), nullable=True)  # windows/linux/mac
    agent_version: Mapped[str | None] = mapped_column(String(30), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")  # ACTIVE / REVOKED / PENDING
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="trusted_devices")  # type: ignore[name-defined]

    @property
    def device_name(self) -> str:
        return self.name

    @device_name.setter
    def device_name(self, value: str) -> None:
        self.name = value

    def __repr__(self) -> str:
        return f"<TrustedDevice id={self.id!r} name={self.name!r} active={self.is_active}>"
