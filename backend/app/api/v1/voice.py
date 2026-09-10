"""
Voice API — Real audio analysis pipeline.
POST /api/v1/voice/analyze   — Upload audio → run full pipeline → return analysis
POST /api/v1/voice/enroll    — Add enrollment sample
POST /api/v1/voice/enroll/finalize — Finalize speaker profile from samples
GET  /api/v1/voice/profile   — Get active speaker profile
DELETE /api/v1/voice/profile — Delete profile (privacy)
"""
import logging
import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, get_current_user_optional
from app.config import get_settings
from app.db.base import get_db
from app.models.user import User
from app.models.speaker_profile import SpeakerProfile, VoiceSampleMetadata
from app.models.voice_analysis import (
    VoiceAnalysis, AnalysisStatus, AnalysisFeatures,
    SpeakerVerificationResult as SVResult,
    ReplayDetectionResult as RDResult,
    RiskScore, AuthenticityLabel
)
from app.models.incident import Incident, AttackType, IncidentStatus
from app.models.command import VoiceCommand, CommandStatus, CommandRisk
from app.models.trusted_device import TrustedDevice
from app.services.audio_processor import extract_features
from app.services.deepfake_detector import detect_deepfake
from app.services.speaker_verification import verify_speaker, identify_speaker
from app.services.replay_detector import detect_replay
from app.services.risk_engine import compute_risk
from app.services.command_interpreter import interpret_command
from app.services.command_validator import validate_command_parameters
from app.services.liveness_service import generate_liveness_challenge, verify_liveness_challenge
from app.services.security_policy_engine import evaluate_security_policy
from app.services.correlation import generate_correlation_id
from app.services.transcription import transcribe
from app.services.email_service import send_command_detected_alert
from app.api.v1.auth import _log_audit

router = APIRouter(prefix="/api/v1/voice", tags=["Voice"])

MAX_AUDIO_SIZE = 10 * 1024 * 1024  # 10 MB


# ─── Helper: Create incident if needed ───────────────────────────────────────

def _maybe_create_incident(
    db: Session,
    user: User,
    analysis: VoiceAnalysis,
    decision: str,
    risk_level: str,
    attack_type: str,
    summary: str,
) -> None:
    """Auto-create incident when decision is BLOCK or risk is HIGH/CRITICAL."""
    if decision == "BLOCK" or risk_level in ("HIGH", "CRITICAL"):
        try:
            at = AttackType.UNKNOWN
            for at_val in AttackType:
                if at_val.value == attack_type:
                    at = at_val
                    break
            incident = Incident(
                user_id=user.id,
                analysis_id=analysis.id,
                attack_type=at,
                risk_level=risk_level,
                status=IncidentStatus.NEW,
                decision=decision,
                summary=summary,
            )
            db.add(incident)
            db.flush()
        except Exception:
            pass  # Don't fail the analysis if incident creation fails


# ─── Liveness Challenge Endpoint ──────────────────────────────────────────────

@router.get("/challenge")
def get_liveness_challenge():
    """Generate dynamic anti-spoof liveness challenge phrase for speaker."""
    challenge = generate_liveness_challenge()
    return {
        "challenge_id": challenge.challenge_id,
        "phrase": challenge.phrase,
        "expires_in_seconds": challenge.expires_in_seconds,
        "instructions": f"Please speak: \"{challenge.phrase}\"",
    }


# ─── Voice Analysis ───────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_voice(
    audio: UploadFile = File(..., description="WAV audio file for analysis"),
    transcript: str = Form(default="", description="Speech-to-text transcript from browser"),
    challenge_id: str = Form(default="", description="Optional liveness challenge ID"),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Run the full voice security pipeline on an uploaded audio file.
    Returns: features, deepfake result, speaker verification, replay detection, risk score.
    """
    # ── Resolve effective user (fallback to development operator for guest demos) ─
    if current_user is None:
        current_user = (
            db.query(User).filter(User.email == "operator@voxshield.ai").first()
            or db.query(User).first()
        )
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required or demo user unavailable.")

    # ── Read & validate audio ─────────────────────────────────────────────────
    if audio.content_type not in ("audio/wav", "audio/wave", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", None):
        raise HTTPException(status_code=400, detail="Unsupported audio format. Please upload WAV audio.")

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file too large. Maximum 10MB.")
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is empty or too small.")

    # ── Create analysis record with correlation ID ───────────────────────────
    analysis_id = str(uuid.uuid4())
    correlation_id = generate_correlation_id()
    analysis = VoiceAnalysis(
        id=analysis_id,
        user_id=current_user.id,
        status=AnalysisStatus.PROCESSING,
        correlation_id=correlation_id,
    )
    db.add(analysis)
    db.flush()

    try:
        # ── 1. Audio Feature Extraction ───────────────────────────────────────
        features = extract_features(audio_bytes)
        analysis.duration_ms = features.duration_ms
        analysis.sample_rate = features.sample_rate

        if not features.is_valid:
            analysis.status = AnalysisStatus.FAILED
            db.commit()
            return {
                "analysis_id": analysis_id,
                "status": "FAILED",
                "error": features.validation_message,
                "features": None,
            }

        # Store features
        af = AnalysisFeatures(
            analysis_id=analysis_id,
            rms=features.rms,
            zcr=features.zcr,
            spectral_centroid=features.spectral_centroid,
            spectral_rolloff=features.spectral_rolloff,
            spectral_flatness=features.spectral_flatness,
            pitch_hz=features.pitch_hz,
            heuristic_authenticity=features.heuristic_authenticity,
            feature_vector_json=json.dumps(features.mfcc_vector),
        )
        db.add(af)

        # ── 2. Deepfake Detection (Heuristic) ─────────────────────────────────
        deepfake_result = detect_deepfake(
            spectral_flatness=features.spectral_flatness,
            zcr=features.zcr,
            pitch_hz=features.pitch_hz,
            heuristic_authenticity=features.heuristic_authenticity,
            rms=features.rms,
            spectral_centroid=features.spectral_centroid,
        )

        # ── 3. Speaker Verification ───────────────────────────────────────────
        active_profile = (
            db.query(SpeakerProfile)
            .filter(
                SpeakerProfile.user_id == current_user.id,
                SpeakerProfile.is_active == True,
                SpeakerProfile.deleted_at == None,
                SpeakerProfile.samples_count >= 1,
            )
            .first()
        )

        enrolled_json = None
        profile_id = None
        if active_profile:
            profile_id = active_profile.id
            # Get best sample feature vector (last sample)
            last_sample = (
                db.query(VoiceSampleMetadata)
                .filter(VoiceSampleMetadata.profile_id == active_profile.id)
                .order_by(VoiceSampleMetadata.sample_index.desc())
                .first()
            )
            if last_sample and last_sample.quality_metrics:
                try:
                    qm = json.loads(last_sample.quality_metrics)
                    enrolled_json = qm.get("mfcc_vector_json")
                except Exception:
                    pass

        sv_result = verify_speaker(features.mfcc_vector, enrolled_json)

        sv_row = SVResult(
            analysis_id=analysis_id,
            profile_id=profile_id,
            label=sv_result.label,
            similarity_score=sv_result.similarity,
            model_name=sv_result.model_name,
            model_version=sv_result.model_version,
            inference_time_ms=sv_result.inference_time_ms,
        )
        db.add(sv_row)

        # ── 4. Replay Detection ───────────────────────────────────────────────
        replay_result = detect_replay(
            spectral_flatness=features.spectral_flatness,
            zcr=features.zcr,
            rms=features.rms,
            spectral_rolloff=features.spectral_rolloff,
            sample_rate=features.sample_rate,
            duration_ms=features.duration_ms,
        )

        rp_row = RDResult(
            analysis_id=analysis_id,
            label=replay_result.label,
            confidence=replay_result.replay_probability,
            model_name=replay_result.model_name,
            inference_time_ms=replay_result.inference_time_ms,
        )
        db.add(rp_row)

        # ── 5. Risk Engine ────────────────────────────────────────────────────
        risk_result = compute_risk(
            deepfake_label=deepfake_result.label,
            synthetic_prob=deepfake_result.synthetic_probability,
            speaker_label=sv_result.label,
            speaker_similarity=sv_result.similarity,
            replay_label=replay_result.label,
            replay_probability=replay_result.replay_probability,
            audio_rms=features.rms,
            audio_valid=features.is_valid,
        )

        rs_row = RiskScore(
            analysis_id=analysis_id,
            total_score=risk_result.total_score,
            risk_level=risk_result.risk_level,
            decision=risk_result.decision,
            weights_json=json.dumps(risk_result.weights_used),
        )
        db.add(rs_row)

        # ── 6. Finalize ───────────────────────────────────────────────────────
        analysis.status = AnalysisStatus.COMPLETE
        analysis.completed_at = datetime.now(timezone.utc)

        # Auto-create incident if needed
        if risk_result.decision == "BLOCK" or risk_result.risk_level in ("HIGH", "CRITICAL"):
            attack_type = AttackType.UNKNOWN
            if deepfake_result.label in ("SUSPICIOUS", "LIKELY_SYNTHETIC"):
                attack_type = AttackType.AI_VOICE
            elif sv_result.label == "MISMATCH":
                attack_type = AttackType.SPEAKER_MISMATCH
            elif replay_result.label in ("REPLAY_SUSPECTED", "REPLAY_DETECTED"):
                attack_type = AttackType.REPLAY_ATTACK

            incident = Incident(
                user_id=current_user.id,
                analysis_id=analysis_id,
                attack_type=attack_type,
                risk_level=risk_result.risk_level,
                status=IncidentStatus.NEW,
                decision=risk_result.decision,
                summary=f"Auto-flagged: {', '.join(risk_result.reasons)}",
            )
            db.add(incident)

        db.commit()

        # ── Response ──────────────────────────────────────────────────────────
        return {
            "analysis_id": analysis_id,
            "correlation_id": correlation_id,
            "status": "COMPLETE",
            "transcript": transcript or "",
            "audio": {
                "duration_ms": features.duration_ms,
                "sample_rate": features.sample_rate,
                "rms": features.rms,
                "valid": features.is_valid,
            },
            "features": {
                "rms": features.rms,
                "zcr": features.zcr,
                "spectral_centroid": features.spectral_centroid,
                "spectral_flatness": features.spectral_flatness,
                "spectral_rolloff": features.spectral_rolloff,
                "pitch_hz": features.pitch_hz,
                "heuristic_authenticity": features.heuristic_authenticity,
            },
            "deepfake_detection": {
                "label": deepfake_result.label,
                "genuine_probability": deepfake_result.genuine_probability,
                "synthetic_probability": deepfake_result.synthetic_probability,
                "confidence": deepfake_result.confidence,
                "reasons": deepfake_result.reasons,
                "model": deepfake_result.model_name,
                "is_heuristic": True,
                "disclaimer": "Heuristic analysis only — not a trained anti-spoofing model.",
            },
            "speaker_verification": {
                "label": sv_result.label,
                "similarity": sv_result.similarity,
                "model": sv_result.model_name,
                "has_profile": active_profile is not None,
                "thresholds": {"match": 0.80, "inconclusive": 0.60},
            },
            "replay_detection": {
                "label": replay_result.label,
                "replay_probability": replay_result.replay_probability,
                "audio_integrity": replay_result.audio_integrity_score,
                "reasons": replay_result.reasons,
                "model": replay_result.model_name,
                "is_heuristic": True,
            },
            "risk": {
                "score": risk_result.total_score,
                "level": risk_result.risk_level,
                "decision": risk_result.decision,
                "reasons": risk_result.reasons,
                "factors": [
                    {"name": f.name, "score": f.score, "weight": f.weight, "label": f.label}
                    for f in risk_result.factors
                ],
            },
        }

    except Exception as exc:
        analysis.status = AnalysisStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(exc)}")


# ─── Voice Enrollment ─────────────────────────────────────────────────────────

@router.post("/enroll")
async def enroll_sample(
    audio: UploadFile = File(...),
    sample_index: int = Form(..., ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add one enrollment voice sample and extract + store its feature vector."""
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio too large.")

    features = extract_features(audio_bytes)
    if not features.is_valid:
        raise HTTPException(status_code=400, detail=features.validation_message)

    if features.duration_ms < 1000:
        raise HTTPException(status_code=400, detail="Enrollment sample must be at least 1 second.")
    if features.rms < 0.01:
        raise HTTPException(status_code=400, detail="Audio too quiet — please speak clearly.")

    # Get or create speaker profile
    profile = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.user_id == current_user.id,
            SpeakerProfile.is_active == True,
            SpeakerProfile.deleted_at == None,
        )
        .first()
    )

    if not profile:
        profile = SpeakerProfile(
            user_id=current_user.id,
            name=f"{current_user.name}'s Voice Profile",
            model_version="heuristic-v1",
            consent_given=True,
            consent_at=datetime.now(timezone.utc),
        )
        db.add(profile)
        db.flush()

    # Remove existing sample at this index
    db.query(VoiceSampleMetadata).filter(
        VoiceSampleMetadata.profile_id == profile.id,
        VoiceSampleMetadata.sample_index == sample_index,
    ).delete()

    # Store sample metadata + feature vector
    quality_metrics = {
        "rms": features.rms,
        "zcr": features.zcr,
        "spectral_centroid": features.spectral_centroid,
        "spectral_flatness": features.spectral_flatness,
        "duration_ms": features.duration_ms,
        "mfcc_vector_json": json.dumps(features.mfcc_vector),
    }

    sample = VoiceSampleMetadata(
        profile_id=profile.id,
        sample_index=sample_index,
        duration_ms=features.duration_ms,
        sample_rate=features.sample_rate,
        quality_metrics=json.dumps(quality_metrics),
    )
    db.add(sample)

    # Update profile sample count
    total_samples = db.query(VoiceSampleMetadata).filter(
        VoiceSampleMetadata.profile_id == profile.id
    ).count() + 1
    profile.samples_count = total_samples
    profile.quality_score = features.heuristic_authenticity

    # Synthesize/average feature vector across all enrolled samples for 1:N recognition
    all_samples = db.query(VoiceSampleMetadata).filter(
        VoiceSampleMetadata.profile_id == profile.id
    ).all()
    sample_vectors = []
    for s in all_samples:
        try:
            m = json.loads(s.quality_metrics or "{}")
            vec = json.loads(m.get("mfcc_vector_json") or "[]")
            if vec and isinstance(vec, list):
                sample_vectors.append(vec)
        except Exception:
            continue

    # Also include the newly recorded sample vector
    if features.mfcc_vector:
        sample_vectors.append(features.mfcc_vector)

    if sample_vectors:
        vec_len = min(len(v) for v in sample_vectors)
        avg_vec = [
            round(sum(v[i] for v in sample_vectors) / len(sample_vectors), 6)
            for i in range(vec_len)
        ]
        profile.feature_vector_json = json.dumps(avg_vec)

    # Check complete identity status
    is_identity_active = (
        current_user.is_verified and
        current_user.phone_verified and
        profile.samples_count >= 3
    )
    if is_identity_active:
        current_user.identity_status = "ACTIVE"

    db.commit()

    return {
        "profile_id": profile.id,
        "sample_index": sample_index,
        "samples_total": profile.samples_count,
        "duration_ms": features.duration_ms,
        "quality": {
            "rms": features.rms,
            "authenticity": features.heuristic_authenticity,
            "valid": True,
        },
        "message": f"Sample {sample_index} enrolled successfully.",
        "enrollment_complete": profile.samples_count >= 3,
        "identity_status": current_user.identity_status,
        "phone_verified": current_user.phone_verified,
        "email_verified": current_user.is_verified,
    }


@router.get("/profile")
def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the active speaker profile for the current user."""
    profile = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.user_id == current_user.id,
            SpeakerProfile.is_active == True,
            SpeakerProfile.deleted_at == None,
        )
        .first()
    )

    if not profile:
        return {"has_profile": False, "profile": None}

    samples = db.query(VoiceSampleMetadata).filter(
        VoiceSampleMetadata.profile_id == profile.id
    ).all()

    return {
        "has_profile": True,
        "profile": {
            "id": profile.id,
            "name": profile.name,
            "model_version": profile.model_version,
            "is_active": profile.is_active,
            "samples_count": profile.samples_count,
            "quality_score": profile.quality_score,
            "consent_given": profile.consent_given,
            "created_at": profile.created_at.isoformat(),
            "enrollment_complete": profile.samples_count >= 3,
        },
        "samples": [
            {
                "index": s.sample_index,
                "duration_ms": s.duration_ms,
                "captured_at": s.captured_at.isoformat(),
            }
            for s in samples
        ],
    }


@router.delete("/profile")
def delete_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete the speaker profile (privacy / data deletion request)."""
    profile = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.user_id == current_user.id,
            SpeakerProfile.is_active == True,
        )
        .first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="No active speaker profile found.")

    profile.is_active = False
    profile.deleted_at = datetime.now(timezone.utc)

    # Delete all sample metadata
    db.query(VoiceSampleMetadata).filter(
        VoiceSampleMetadata.profile_id == profile.id
    ).delete()

    current_user.identity_status = "INCOMPLETE"
    db.commit()

    _log_audit(db, "VOICE_PROFILE_DELETED", "SUCCESS", user_id=current_user.id)
    return {
        "message": "Speaker profile and all voice biometric data deleted successfully.",
        "profile_id": profile.id,
        "identity_status": "INCOMPLETE",
    }


@router.post("/profile/reset")
def reset_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset voice samples to allow re-enrolling from scratch."""
    profile = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.user_id == current_user.id,
            SpeakerProfile.is_active == True,
            SpeakerProfile.deleted_at == None,
        )
        .first()
    )
    if profile:
        db.query(VoiceSampleMetadata).filter(VoiceSampleMetadata.profile_id == profile.id).delete()
        profile.samples_count = 0
        profile.feature_vector_json = None
        profile.quality_score = None

    current_user.identity_status = "INCOMPLETE"
    db.commit()

    _log_audit(db, "VOICE_PROFILE_RESET", "SUCCESS", user_id=current_user.id)
    return {
        "message": "Voice profile reset. You can now re-enroll voice samples.",
        "identity_status": "INCOMPLETE",
    }


# ─── Voice Analysis History & Forensics ────────────────────────────────────────

@router.get("/analyses")
def list_analyses(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List recent voice analyses for current user (or all if analyst/admin)."""
    query = db.query(VoiceAnalysis)
    if current_user.role.value not in ("admin", "security_analyst"):
        query = query.filter(VoiceAnalysis.user_id == current_user.id)
    analyses = query.order_by(VoiceAnalysis.created_at.desc()).limit(limit).all()

    return {
        "analyses": [
            {
                "id": a.id,
                "created_at": a.created_at.isoformat(),
                "duration_ms": a.duration_ms,
                "sample_rate": a.sample_rate,
                "audio_hash": a.audio_hash,
                "status": a.status.value,
                "risk_level": a.risk_score.risk_level if a.risk_score else "UNKNOWN",
                "risk_score": a.risk_score.total_score if a.risk_score else None,
                "decision": a.risk_score.decision if a.risk_score else "UNKNOWN",
                "authenticity": a.features.heuristic_authenticity if a.features else None,
                "speaker_label": a.speaker_verification.label.value if a.speaker_verification else "MODEL_UNAVAILABLE",
                "speaker_similarity": a.speaker_verification.similarity_score if a.speaker_verification else None,
                "replay_label": a.replay_detection.label.value if a.replay_detection else "MODEL_UNAVAILABLE",
            }
            for a in analyses
        ]
    }


@router.get("/analyses/{analysis_id}")
def get_analysis_detail(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full deep forensic data for a single voice analysis."""
    analysis = db.query(VoiceAnalysis).filter(VoiceAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Voice analysis not found.")

    if current_user.role.value not in ("admin", "security_analyst") and analysis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot access this analysis.")

    # Parse features
    features_data = None
    mfcc_vector = []
    if analysis.features:
        f = analysis.features
        if f.feature_vector_json:
            try:
                mfcc_vector = json.loads(f.feature_vector_json)
            except Exception:
                mfcc_vector = []
        features_data = {
            "rms": f.rms,
            "zcr": f.zcr,
            "spectral_centroid": f.spectral_centroid,
            "spectral_rolloff": f.spectral_rolloff,
            "spectral_flatness": f.spectral_flatness,
            "pitch_hz": f.pitch_hz,
            "heuristic_authenticity": f.heuristic_authenticity,
            "mfcc_vector": mfcc_vector,
        }

    # Speaker verification
    sv_data = None
    if analysis.speaker_verification:
        sv = analysis.speaker_verification
        sv_data = {
            "label": sv.label.value,
            "similarity": sv.similarity_score,
            "model_name": sv.model_name,
            "model_version": sv.model_version,
            "inference_time_ms": sv.inference_time_ms,
            "has_profile": sv.profile_id is not None,
        }

    # Replay detection
    rp_data = None
    if analysis.replay_detection:
        rp = analysis.replay_detection
        rp_data = {
            "label": rp.label.value,
            "replay_probability": rp.confidence,
            "audio_integrity": round(1.0 - (rp.confidence or 0.0), 4) if rp.confidence is not None else None,
            "model_name": rp.model_name,
            "inference_time_ms": rp.inference_time_ms,
        }

    # Risk score
    risk_data = None
    if analysis.risk_score:
        rs = analysis.risk_score
        weights = {}
        if rs.weights_json:
            try:
                weights = json.loads(rs.weights_json)
            except Exception:
                pass
        risk_data = {
            "score": rs.total_score,
            "level": rs.risk_level,
            "decision": rs.decision,
            "weights_used": weights,
        }

    # Linked incident
    incident = db.query(Incident).filter(Incident.analysis_id == analysis_id).first()
    incident_data = None
    if incident:
        incident_data = {
            "id": incident.id,
            "attack_type": incident.attack_type.value,
            "risk_level": incident.risk_level,
            "status": incident.status.value,
            "summary": incident.summary,
            "created_at": incident.created_at.isoformat(),
        }

    # Linked commands
    commands = [
        {
            "id": c.id,
            "intent": c.intent,
            "risk": c.risk.value,
            "status": c.status.value,
            "raw_transcript": c.raw_transcript,
            "created_at": c.created_at.isoformat(),
        }
        for c in analysis.commands
    ]

    return {
        "analysis_id": analysis.id,
        "user_id": analysis.user_id,
        "status": analysis.status.value,
        "created_at": analysis.created_at.isoformat(),
        "completed_at": analysis.completed_at.isoformat() if analysis.completed_at else None,
        "audio": {
            "duration_ms": analysis.duration_ms,
            "sample_rate": analysis.sample_rate,
            "audio_hash": analysis.audio_hash,
        },
        "features": features_data,
        "speaker_verification": sv_data,
        "replay_detection": rp_data,
        "risk": risk_data,
        "incident": incident_data,
        "commands": commands,
    }


# ─── Unified Voice-to-Command Transaction Pipeline ────────────────────────────

@router.post("/process-command")
async def process_voice_command(
    audio: UploadFile = File(..., description="Voice command audio file (WAV/WEBM)"),
    transcript: str = Form(default="", description="Optional browser transcription hint"),
    device_name: str = Form(default="", description="Target laptop device name"),
    challenge_id: str = Form(default="", description="Optional active dynamic liveness challenge token"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    End-to-End Voice Security & Command Pipeline (Phase 6 Hardened):
    1. Correlation Tracking (VX-2026-XXXXXX)
    2. Voice Quality & VAD
    3. Authenticity & Deepfake Detection (Synthetic probability)
    4. Acoustic Replay Detection (Environment & channel integrity)
    5. 1:N Global Speaker Identification ("Who is speaking?")
    6. Speech-to-Text Transcription
    7. Allowlisted Intent Parsing
    8. Parameter Sanitization & Path Traversal / Shell Metacharacter Protection
    9. Dynamic Liveness Challenge Validation (if challenge_id provided)
    10. Authoritative Security Policy Engine Evaluation
    11. Trusted Device Presence & State Binding
    12. Dispatch Alert Notification ("WAITING FOR CONTINUE")
    13. Automatic Security Incident Creation on Anomalies
    14. Tamper-evident Audit Timeline Logging
    """
    correlation_id = generate_correlation_id()
    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=413, detail="Audio file exceeds 10 MB limit.")

    # 1. Extract DSP features
    features = extract_features(audio_bytes)
    if not features.is_valid:
        raise HTTPException(status_code=400, detail=features.validation_message)

    # 2. Authenticity / Deepfake detection
    deepfake_result = detect_deepfake(features)

    # 3. Replay detection
    replay_result = detect_replay(features)

    # 4. 1:N Global Speaker Identification across all enrolled profiles
    enrolled_rows = (
        db.query(SpeakerProfile, User)
        .join(User, SpeakerProfile.user_id == User.id)
        .filter(
            SpeakerProfile.is_active == True,
            SpeakerProfile.samples_count >= 3,
            SpeakerProfile.deleted_at == None,
        )
        .all()
    )
    profile_dicts = [
        {
            "user_id": p.user_id,
            "name": u.name,
            "feature_vector_json": p.feature_vector_json,
        }
        for p, u in enrolled_rows
        if p.feature_vector_json
    ]
    id_result = identify_speaker(features.mfcc_vector, profile_dicts)

    # 5. Speech-to-Text transcription
    final_transcript = transcript.strip()
    if not final_transcript:
        stt_result = transcribe(audio_bytes)
        final_transcript = stt_result.text if stt_result.is_available else ""

    if not final_transcript:
        final_transcript = "Unrecognized voice command"

    # 6. Intent & Command Extraction
    cmd_result = interpret_command(final_transcript)

    # 7. Parameter Sanitization & Shell Metacharacter Protection
    is_param_valid, param_err, sanitized_parameters = validate_command_parameters(
        cmd_result.intent, cmd_result.parameters
    )

    # 8. Dynamic Liveness Challenge Verification
    liveness_ok = True
    liveness_detail = "PASS"
    if challenge_id and challenge_id.strip():
        liveness_ok, liveness_msg = verify_liveness_challenge(challenge_id.strip(), final_transcript)
        if not liveness_ok:
            liveness_detail = f"FAILED: {liveness_msg}"

    # 9. Laptop presence & binding
    target_device = None
    if device_name and device_name.strip():
        target_device = db.query(TrustedDevice).filter(
            TrustedDevice.user_id == current_user.id,
            TrustedDevice.name == device_name.strip(),
            TrustedDevice.is_active == True,
        ).first()

    if not target_device:
        target_device = (
            db.query(TrustedDevice)
            .filter(TrustedDevice.user_id == current_user.id, TrustedDevice.is_active == True)
            .order_by(TrustedDevice.last_seen_at.desc().nullslast())
            .first()
        )

    now = datetime.now(timezone.utc)
    is_device_online = False
    if target_device and target_device.last_seen_at:
        diff_sec = (now - target_device.last_seen_at.replace(tzinfo=timezone.utc)).total_seconds()
        is_device_online = diff_sec <= 45

    device_display_name = target_device.name if target_device else (device_name.strip() or "Primary Workstation")

    # 10. Multi-factor Risk Assessment
    speaker_match_bool = id_result.is_verified
    risk_result = compute_risk(
        deepfake_label=deepfake_result.label,
        synthetic_prob=deepfake_result.synthetic_probability,
        speaker_label=id_result.label,
        speaker_similarity=id_result.similarity,
        replay_label=replay_result.label,
        replay_prob=replay_result.replay_probability,
        audio_rms=features.rms or 0.05,
        audio_is_valid=features.is_valid,
        command_risk=cmd_result.risk,
    )

    # 11. Centralized Security Policy Engine Evaluation
    policy_decision = evaluate_security_policy(
        synthetic_prob=deepfake_result.synthetic_probability,
        deepfake_label=deepfake_result.label,
        heuristic_authenticity=features.heuristic_authenticity,
        replay_prob=replay_result.replay_probability,
        replay_label=replay_result.label,
        is_known_speaker=id_result.is_verified,
        speaker_similarity=id_result.similarity,
        speaker_label=id_result.label,
        audio_valid=features.is_valid,
        validation_message=features.validation_message,
        is_command_allowed=cmd_result.is_allowed and is_param_valid,
        command_intent=cmd_result.intent,
        command_risk=cmd_result.risk,
        command_requires_approval=cmd_result.requires_approval,
        liveness_verified=liveness_ok,
        is_device_online=is_device_online,
        device_active=target_device.is_active if target_device else False,
    )

    # ── Real Zero-Trust Security Decision & Risk Evaluation ───────────────────────
    is_speaker_verified = id_result.is_verified and id_result.label == "VERIFIED"
    is_intent_allowlisted = cmd_result.is_allowed and cmd_result.intent != "UNKNOWN" and is_param_valid
    is_voice_genuine = deepfake_result.label != "SYNTHETIC" and replay_result.label not in ("REPLAY_DETECTED", "REPLAY_SUSPECTED")

    if not is_voice_genuine:
        # Voice is synthetic/spoofed or replayed — CRITICAL THREAT
        initial_status = CommandStatus.BLOCKED
        risk_enum = CommandRisk.CRITICAL
        cmd_result.risk = "CRITICAL"
        policy_decision.reasons = [
            f"Voice authenticity anomaly: Synthetic AI/cloned speech or acoustic replay detected ({deepfake_result.label}). Execution permanently blocked."
        ]
    elif not is_speaker_verified:
        # Unknown or mismatched speaker — Hard Block with HIGH/CRITICAL risk
        initial_status = CommandStatus.BLOCKED
        risk_enum = CommandRisk.CRITICAL if (id_result.similarity or 0.0) < 0.50 else CommandRisk.HIGH
        cmd_result.risk = risk_enum.value
        policy_decision.reasons = [
            f"Speaker identification failure: Voice did not match authorized profile ({id_result.identified_name}). Execution blocked on workstation."
        ]
    elif not is_intent_allowlisted:
        # Intent is UNKNOWN or not in allowlist
        initial_status = CommandStatus.BLOCKED
        risk_enum = CommandRisk.HIGH
        cmd_result.risk = "HIGH"
        policy_decision.reasons = [
            f"Command intent '{cmd_result.intent}' is not in allowlist. Execution blocked."
        ]
    elif policy_decision.requires_email_approval or policy_decision.requires_otp or cmd_result.requires_approval:
        # High risk action requiring secondary approval
        initial_status = CommandStatus.APPROVAL_REQUIRED
        risk_enum = CommandRisk.HIGH if cmd_result.risk in ("HIGH", "CRITICAL") else CommandRisk.MEDIUM
    elif policy_decision.requires_laptop_continue:
        initial_status = CommandStatus.WAITING_FOR_CONTINUE
        risk_enum = CommandRisk.LOW
    else:
        # Genuine authorized speaker + safe allowlisted low-risk command
        initial_status = CommandStatus.APPROVED
        risk_enum = CommandRisk.LOW

    # 12. Persist VoiceAnalysis record
    audio_hash = hashlib.sha256(audio_bytes).hexdigest()
    analysis = VoiceAnalysis(
        user_id=current_user.id,
        duration_ms=features.duration_ms,
        sample_rate=features.sample_rate,
        audio_hash=audio_hash,
        correlation_id=correlation_id,
        status=AnalysisStatus.COMPLETE,
        completed_at=now,
    )
    db.add(analysis)
    db.flush()

    # Features (Clean fix for AnalysisFeatures columns)
    db.add(AnalysisFeatures(
        analysis_id=analysis.id,
        rms=features.rms,
        zcr=features.zcr,
        spectral_centroid=features.spectral_centroid,
        spectral_rolloff=features.spectral_rolloff,
        spectral_flatness=features.spectral_flatness,
        pitch_hz=features.pitch_hz,
        heuristic_authenticity=features.heuristic_authenticity,
        feature_vector_json=json.dumps(features.mfcc_vector) if features.mfcc_vector else None,
    ))

    # Speaker verification / identification
    db.add(SVResult(
        analysis_id=analysis.id,
        profile_id=None,
        label="MATCH" if id_result.is_verified else "MISMATCH",
        similarity_score=id_result.similarity,
        identified_user_id=id_result.identified_user_id,
        identified_user_name=id_result.identified_name,
        match_confidence=id_result.confidence,
        is_known_identity=id_result.is_verified,
        model_name=id_result.model_name,
        model_version=id_result.model_version,
        inference_time_ms=id_result.inference_time_ms,
    ))

    # Replay
    db.add(RDResult(
        analysis_id=analysis.id,
        label=replay_result.label,
        confidence=replay_result.replay_probability,
        model_name=replay_result.model_name,
        inference_time_ms=replay_result.inference_time_ms,
    ))

    # Risk score
    db.add(RiskScore(
        analysis_id=analysis.id,
        total_score=risk_result.total_score,
        risk_level=risk_result.risk_level,
        decision=risk_result.decision,
        weights_json=json.dumps([
            {"name": f.name, "score": f.score, "weight": f.weight}
            for f in risk_result.factors
        ]),
    ))

    # Create VoiceCommand
    command = VoiceCommand(
        analysis_id=analysis.id,
        user_id=current_user.id,
        device_id=target_device.id if target_device else None,
        device_name=device_display_name,
        identified_user_id=id_result.identified_user_id,
        identified_user_name=id_result.identified_name,
        speaker_match_score=id_result.match_score,
        raw_transcript=final_transcript,
        intent=cmd_result.intent,
        risk=risk_enum,
        parameters_json=json.dumps(sanitized_parameters),
        status=initial_status,
        correlation_id=correlation_id,
        expires_at=now + timedelta(minutes=15),
    )
    db.add(command)
    db.commit()
    db.refresh(command)

    # 13. Trigger Email 1: Command Detected Alert
    email_sent = send_command_detected_alert(
        to_email=current_user.email,
        person_name=id_result.identified_name,
        command_intent=cmd_result.intent,
        command_description=cmd_result.description,
        speaker_verification=id_result.label,
        speaker_score=id_result.match_score,
        voice_authenticity="AUTHENTIC" if deepfake_result.label != "SYNTHETIC" else "SYNTHETIC / AI DETECTED",
        replay_status="CLEAR" if replay_result.label not in ("REPLAY_SUSPECTED", "REPLAY_DETECTED") else "REPLAY DETECTED",
        risk_level=cmd_result.risk,
        device_name=device_display_name,
        status_label=initial_status.value.replace("_", " "),
    )

    # 14. Auto-create Incident if suspicious attack detected
    incident_id = None
    if initial_status == CommandStatus.BLOCKED or cmd_result.risk in ("HIGH", "CRITICAL") or not is_param_valid:
        attack_type = AttackType.UNKNOWN
        incident_summary = f"Voice command blocked or flagged for security review: {cmd_result.intent}"
        if not is_param_valid:
            attack_type = AttackType.CRITICAL_COMMAND_BLOCKED
            incident_summary = f"Malicious command parameter injection blocked: {param_err}"
        elif deepfake_result.label == "SYNTHETIC":
            attack_type = AttackType.AI_VOICE
            incident_summary = f"Synthetic/AI cloned voice detected while attempting action: {cmd_result.intent}"
        elif replay_result.label in ("REPLAY_DETECTED", "REPLAY_SUSPECTED"):
            attack_type = AttackType.REPLAY_ATTACK
            incident_summary = f"Acoustic replay attack detected while attempting action: {cmd_result.intent}"
        elif id_result.label in ("UNKNOWN", "MISMATCH"):
            attack_type = AttackType.SPEAKER_MISMATCH
            incident_summary = f"Unenrolled or mismatched speaker attempted voice command: {cmd_result.intent}"
        elif not liveness_ok:
            attack_type = AttackType.REPLAY_ATTACK
            incident_summary = f"Dynamic liveness challenge failed: {liveness_detail}"
        elif cmd_result.risk in ("HIGH", "CRITICAL"):
            attack_type = AttackType.CRITICAL_COMMAND_BLOCKED
            incident_summary = f"High-risk command gated behind secondary verification: {cmd_result.intent}"

        try:
            incident = Incident(
                user_id=current_user.id,
                analysis_id=analysis.id,
                command_id=command.id,
                device_id=target_device.id if target_device else None,
                attack_type=attack_type,
                risk_level=cmd_result.risk,
                status=IncidentStatus.NEW,
                decision="BLOCK" if initial_status == CommandStatus.BLOCKED else "VERIFY",
                summary=incident_summary,
            )
            db.add(incident)
            db.commit()
            incident_id = incident.id
            _log_audit(db, "INCIDENT_CREATED", "ALERT", user_id=current_user.id, detail={"incident_id": incident.id, "attack_type": attack_type.value, "correlation_id": correlation_id})
        except Exception as e:
            logger.warning("Failed to auto-create incident: %s", e)

    # 15. Emit complete audit timeline
    _log_audit(db, "VOICE_RECEIVED", "SUCCESS", user_id=current_user.id, detail={"duration_ms": features.duration_ms, "correlation_id": correlation_id})
    _log_audit(db, "AUTHENTICITY_CHECKED", "SUCCESS" if deepfake_result.label != "SYNTHETIC" else "FAILURE", user_id=current_user.id, detail={"label": deepfake_result.label, "correlation_id": correlation_id})
    _log_audit(db, "REPLAY_CHECKED", "SUCCESS" if replay_result.label not in ("REPLAY_DETECTED", "REPLAY_SUSPECTED") else "FAILURE", user_id=current_user.id, detail={"label": replay_result.label, "correlation_id": correlation_id})
    _log_audit(db, "SPEAKER_IDENTIFIED", "SUCCESS" if id_result.is_verified else "UNKNOWN", user_id=current_user.id, detail={"speaker": id_result.identified_name, "score": id_result.match_score, "correlation_id": correlation_id})
    _log_audit(db, "TRANSCRIPTION_COMPLETED", "SUCCESS", user_id=current_user.id, detail={"transcript": final_transcript, "correlation_id": correlation_id})
    _log_audit(db, "COMMAND_IDENTIFIED", "SUCCESS", user_id=current_user.id, detail={"intent": cmd_result.intent, "risk": cmd_result.risk, "correlation_id": correlation_id})
    _log_audit(db, "SECURITY_DECISION", initial_status.value, user_id=current_user.id, detail={"status": initial_status.value, "command_id": command.id, "reasons": policy_decision.reasons, "correlation_id": correlation_id})
    if target_device:
        _log_audit(db, "DEVICE_SELECTED", "SUCCESS" if is_device_online else "OFFLINE", user_id=current_user.id, detail={"device": device_display_name, "is_online": is_device_online, "correlation_id": correlation_id})
    if email_sent:
        _log_audit(db, "EMAIL_SENT", "SUCCESS", user_id=current_user.id, detail={"to": current_user.email, "type": "COMMAND_DETECTED_ALERT", "correlation_id": correlation_id})

    _log_audit(
        db,
        "VOICE_COMMAND_PROCESSED",
        "SUCCESS" if initial_status != CommandStatus.BLOCKED else "BLOCKED",
        user_id=current_user.id,
        detail={
            "command_id": command.id,
            "correlation_id": correlation_id,
            "intent": cmd_result.intent,
            "identified_speaker": id_result.identified_name,
            "match_score": id_result.match_score,
            "risk": cmd_result.risk,
            "status": initial_status.value,
            "device": device_display_name,
            "is_device_online": is_device_online,
            "incident_id": incident_id,
            "policy_verdict": policy_decision.verdict.value,
        },
    )

    # 16. Return full response for UI
    return {
        "correlation_id": correlation_id,
        "analysis_id": analysis.id,
        "person_detected": {
            "name": id_result.identified_name,
            "user_id": id_result.identified_user_id,
            "match_score": id_result.match_score,
            "similarity": id_result.similarity,
            "identity_status": id_result.label,
            "confidence": id_result.confidence,
            "is_verified": id_result.is_verified,
            "ranked_matches": id_result.ranked_matches,
        },
        "voice_authenticity": {
            "label": "AUTHENTIC" if deepfake_result.label != "SYNTHETIC" else "SYNTHETIC",
            "genuine_probability": deepfake_result.genuine_probability,
            "synthetic_probability": deepfake_result.synthetic_probability,
            "is_heuristic": True,
        },
        "replay_detection": {
            "label": replay_result.label,
            "is_clear": replay_result.label not in ("REPLAY_SUSPECTED", "REPLAY_DETECTED"),
        },
        "liveness": {
            "verified": liveness_ok,
            "detail": liveness_detail,
        },
        "command": {
            "command_id": command.id,
            "correlation_id": correlation_id,
            "intent": cmd_result.intent,
            "description": cmd_result.description,
            "transcript": final_transcript,
            "risk": risk_enum.value,
            "status": command.status.value,
            "requires_approval": policy_decision.requires_email_approval or cmd_result.requires_approval,
            "requires_laptop_continue": policy_decision.requires_laptop_continue,
            "is_allowed": is_intent_allowlisted and is_speaker_verified,
            "rejection_reason": (
                f"Speaker identification failure: Voice does not match authorized profile ({id_result.identified_name}). Access blocked."
                if not is_speaker_verified
                else (param_err if not is_param_valid else cmd_result.rejection_reason)
            ),
            "parameters": sanitized_parameters,
            "expires_at": command.expires_at.isoformat() if command.expires_at else None,
        },
        "security_policy": {
            "verdict": policy_decision.verdict.value,
            "initial_status": policy_decision.initial_status.value,
            "reasons": policy_decision.reasons,
            "risk_score": policy_decision.risk_score,
            "requires_email_approval": policy_decision.requires_email_approval,
            "requires_otp": policy_decision.requires_otp,
            "requires_laptop_continue": policy_decision.requires_laptop_continue,
        },
        "device": {
            "device_id": target_device.id if target_device else None,
            "device_name": device_display_name,
            "is_online": is_device_online,
            "last_seen_at": target_device.last_seen_at.isoformat() if (target_device and target_device.last_seen_at) else None,
        },
        "risk": {
            "score": risk_result.total_score if is_speaker_verified else max(85.0, risk_result.total_score),
            "level": risk_enum.value,
            "decision": "BLOCK" if initial_status == CommandStatus.BLOCKED else risk_result.decision,
            "reasons": policy_decision.reasons or risk_result.reasons,
        },
        "email_alert_sent": email_sent,
        "incident_id": incident_id,
        "status": command.status.value,
    }



