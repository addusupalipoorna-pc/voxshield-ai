"""
Health and model-status endpoints.
GET /health          — liveness + DB check
GET /api/v1/model-status — pipeline service status (consumed by frontend)
"""
import time
from fastapi import APIRouter
from app.config import get_settings
from app.db.base import check_db_connection
from app.schemas.health import HealthResponse
from app.schemas.model_status import ModelStatusResponse, ServiceStatusItem
from app.services.base_detector import (
    get_speaker_service,
    get_deepfake_service,
    get_replay_service,
    get_transcription_service,
)

router = APIRouter()
_start_time = time.time()


@router.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Liveness probe — returns DB connectivity status."""
    settings = get_settings()
    db_ok = check_db_connection()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        version=settings.app_version,
        environment=settings.app_env,
        db="connected" if db_ok else "unavailable",
        uptime_seconds=round(time.time() - _start_time, 1),
    )


@router.get("/model-status", response_model=ModelStatusResponse, tags=["System"])
@router.get("/api/v1/model-status", response_model=ModelStatusResponse, tags=["System"])
@router.get("/api/v1/health/model-status", response_model=ModelStatusResponse, tags=["System"])
def model_status():
    """Pipeline service status — consumed by the frontend Pipeline Status panel."""
    settings = get_settings()
    speaker_st = get_speaker_service().get_status()
    deepfake_st = get_deepfake_service().get_status()
    replay_st = get_replay_service().get_status()
    stt_st = get_transcription_service().get_status()

    services = [
        ServiceStatusItem(
            name=deepfake_st.name,
            key="deepfake_detector",
            status=deepfake_st.readiness.value,
            version=deepfake_st.version,
            note=deepfake_st.description,
        ),
        ServiceStatusItem(
            name=speaker_st.name,
            key="speaker_verification",
            status=speaker_st.readiness.value,
            version=speaker_st.version,
            note=speaker_st.description,
        ),
        ServiceStatusItem(
            name=replay_st.name,
            key="replay_detector",
            status=replay_st.readiness.value,
            version=replay_st.version,
            note=replay_st.description,
        ),
        ServiceStatusItem(
            name=stt_st.name,
            key="transcription",
            status=stt_st.readiness.value,
            version=stt_st.version,
            note=stt_st.description,
        ),
        ServiceStatusItem(
            name="Deterministic Risk Engine",
            key="risk_engine",
            status="ONLINE",
            version="1.0.0",
            note="Configurable multi-factor risk evaluator with allowlist intent validation.",
        ),
        ServiceStatusItem(
            name="Laptop Agent Gateway",
            key="laptop_agent",
            status="ONLINE",
            version="1.0.0",
            note="Polling endpoint active for authorized Windows execution agents.",
        ),
        ServiceStatusItem(
            name="Audio DSP Analysis",
            key="heuristic_analysis",
            status="HEURISTIC",
            version="1.0.0",
            note="Real-time Web Audio API feature extraction (RMS, ZCR, Spectral Centroid, Flatness).",
        ),
        ServiceStatusItem(
            name="FastAPI Backend",
            key="backend",
            status="ONLINE",
            version=settings.app_version,
            note="Primary API server running with database and security middleware.",
        ),
    ]

    return ModelStatusResponse(
        phase=3,
        services=services,
    )
