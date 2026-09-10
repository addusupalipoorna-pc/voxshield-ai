"""
Speaker profile and voice sample metadata models.
Raw audio is NOT stored — only extracted feature metadata.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class SpeakerProfile(Base):
    __tablename__ = "speaker_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Default Profile")
    model_version: Mapped[str] = mapped_column(String(80), nullable=False, default="heuristic-v1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    samples_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feature_vector_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # Averaged/enrolled embedding vector

    # Consent — GDPR/privacy compliance
    consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="speaker_profiles")  # type: ignore[name-defined]
    samples: Mapped[list["VoiceSampleMetadata"]] = relationship(
        "VoiceSampleMetadata", back_populates="profile", cascade="all, delete-orphan"
    )

    @property
    def enrollment_complete(self) -> bool:
        return self.samples_count >= 3

    @enrollment_complete.setter
    def enrollment_complete(self, value: bool) -> None:
        pass

    def __repr__(self) -> str:
        return f"<SpeakerProfile id={self.id!r} user_id={self.user_id!r}>"


class VoiceSampleMetadata(Base):
    """
    Metadata only — raw audio is NOT stored.
    Feature vectors may be stored in the backend for real speaker models (Phase 5).
    """
    __tablename__ = "voice_samples_metadata"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id: Mapped[str] = mapped_column(String(36), ForeignKey("speaker_profiles.id", ondelete="CASCADE"), nullable=False, index=True)

    sample_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 1, 2, 3
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_metrics: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON blob
    model_version: Mapped[str] = mapped_column(String(80), nullable=False, default="heuristic-v1")

    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationship
    profile: Mapped["SpeakerProfile"] = relationship("SpeakerProfile", back_populates="samples")

    def __repr__(self) -> str:
        return f"<VoiceSampleMetadata id={self.id!r} index={self.sample_index}>"
