"""
System settings and model version registry.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SystemSetting(Base):
    """Key-value store for runtime-configurable settings (risk weights, thresholds, etc.)."""
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ModelVersion(Base):
    """Registry of ML model versions deployed in the pipeline."""
    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # e.g. speaker_verification / deepfake_detector / replay_detector / transcription
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
