"""
Import all models here so Alembic and create_all() can discover them.
"""
from app.db.base import Base  # noqa: F401

# Models — import order matters for FK resolution
from app.models.user import User  # noqa: F401
from app.models.speaker_profile import SpeakerProfile, VoiceSampleMetadata  # noqa: F401
from app.models.voice_analysis import (  # noqa: F401
    VoiceAnalysis,
    AnalysisFeatures,
    SpeakerVerificationResult,
    ReplayDetectionResult,
    RiskScore,
)
from app.models.command import VoiceCommand, CommandApproval  # noqa: F401
from app.models.incident import Incident  # noqa: F401
from app.models.audit_log import AuditLog  # noqa: F401
from app.models.trusted_device import TrustedDevice  # noqa: F401
from app.models.notification import Notification  # noqa: F401
from app.models.system import SystemSetting, ModelVersion  # noqa: F401
from app.models.tokens import EmailVerificationToken, PasswordResetToken, RefreshToken  # noqa: F401
from app.models.otp import OTPVerification  # noqa: F401

