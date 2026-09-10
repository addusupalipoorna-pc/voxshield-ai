"""
Voice analysis models: core analysis, DSP features, speaker verification,
replay detection, and risk score — one row per analysis session.
"""
import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
import enum


class AnalysisStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


class AuthenticityLabel(str, enum.Enum):
    GENUINE = "GENUINE"
    SUSPICIOUS = "SUSPICIOUS"
    AI_GENERATED = "AI_GENERATED"
    INCONCLUSIVE = "INCONCLUSIVE"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    HEURISTIC_ONLY = "HEURISTIC_ONLY"


class SpeakerMatchLabel(str, enum.Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    INCONCLUSIVE = "INCONCLUSIVE"
    NO_PROFILE = "NO_PROFILE"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class ReplayLabel(str, enum.Enum):
    CLEAR = "CLEAR"
    REPLAY_SUSPECTED = "REPLAY_SUSPECTED"
    REPLAY_DETECTED = "REPLAY_DETECTED"
    INCONCLUSIVE = "INCONCLUSIVE"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"


class VoiceAnalysis(Base):
    __tablename__ = "voice_analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[AnalysisStatus] = mapped_column(Enum(AnalysisStatus), nullable=False, default=AnalysisStatus.PENDING)

    # Audio metadata (no raw audio stored)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audio_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA-256 for forensics
    correlation_id: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="voice_analyses")  # type: ignore[name-defined]
    features: Mapped["AnalysisFeatures | None"] = relationship("AnalysisFeatures", back_populates="analysis", uselist=False)
    speaker_verification: Mapped["SpeakerVerificationResult | None"] = relationship("SpeakerVerificationResult", back_populates="analysis", uselist=False)
    replay_detection: Mapped["ReplayDetectionResult | None"] = relationship("ReplayDetectionResult", back_populates="analysis", uselist=False)
    risk_score: Mapped["RiskScore | None"] = relationship("RiskScore", back_populates="analysis", uselist=False)
    commands: Mapped[list["VoiceCommand"]] = relationship("VoiceCommand", back_populates="analysis")  # type: ignore[name-defined]


class AnalysisFeatures(Base):
    """Raw DSP features extracted from the audio."""
    __tablename__ = "analysis_features"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_analyses.id", ondelete="CASCADE"), nullable=False, unique=True)

    rms: Mapped[float | None] = mapped_column(Float, nullable=True)
    zcr: Mapped[float | None] = mapped_column(Float, nullable=True)
    spectral_centroid: Mapped[float | None] = mapped_column(Float, nullable=True)
    spectral_rolloff: Mapped[float | None] = mapped_column(Float, nullable=True)
    spectral_flatness: Mapped[float | None] = mapped_column(Float, nullable=True)
    pitch_hz: Mapped[float | None] = mapped_column(Float, nullable=True)
    heuristic_authenticity: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0-1 heuristic score

    # Stored as JSON string (mel bins, MFCC, etc.)
    feature_vector_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    analysis: Mapped["VoiceAnalysis"] = relationship("VoiceAnalysis", back_populates="features")


class SpeakerVerificationResult(Base):
    __tablename__ = "speaker_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_analyses.id", ondelete="CASCADE"), nullable=False, unique=True)
    profile_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("speaker_profiles.id"), nullable=True)

    label: Mapped[SpeakerMatchLabel] = mapped_column(Enum(SpeakerMatchLabel), nullable=False, default=SpeakerMatchLabel.MODEL_UNAVAILABLE)
    similarity_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # 1:N Global Speaker Identification fields
    identified_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    identified_user_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    match_confidence: Mapped[str | None] = mapped_column(String(20), nullable=True)  # HIGH / MEDIUM / LOW
    is_known_identity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    model_name: Mapped[str] = mapped_column(String(80), nullable=False, default="heuristic-cosine-v1")
    model_version: Mapped[str] = mapped_column(String(40), nullable=False, default="1.0.0")
    inference_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    analysis: Mapped["VoiceAnalysis"] = relationship("VoiceAnalysis", back_populates="speaker_verification")


class ReplayDetectionResult(Base):
    __tablename__ = "replay_detections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_analyses.id", ondelete="CASCADE"), nullable=False, unique=True)

    label: Mapped[ReplayLabel] = mapped_column(Enum(ReplayLabel), nullable=False, default=ReplayLabel.MODEL_UNAVAILABLE)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_name: Mapped[str] = mapped_column(String(80), nullable=False, default="UNAVAILABLE")
    inference_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    analysis: Mapped["VoiceAnalysis"] = relationship("VoiceAnalysis", back_populates="replay_detection")


class RiskScore(Base):
    __tablename__ = "risk_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(String(36), ForeignKey("voice_analyses.id", ondelete="CASCADE"), nullable=False, unique=True)

    total_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0-100
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)   # SAFE/CAUTION/HIGH/CRITICAL
    decision: Mapped[str] = mapped_column(String(30), nullable=False)     # ALLOW/VERIFY/BLOCK
    weights_json: Mapped[str | None] = mapped_column(Text, nullable=True) # JSON of component weights used

    analysis: Mapped["VoiceAnalysis"] = relationship("VoiceAnalysis", back_populates="risk_score")
