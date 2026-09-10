"""
Replay / Spoof Detector — Heuristic Signal Analysis.

Analyzes audio for characteristics indicative of replay attacks:
- Recorded and re-played audio through a speaker
- Compressed or resampled audio artifacts
- Abnormal background noise patterns

DISCLAIMER: Heuristic only. Clearly labeled HEURISTIC_DEMO.
"""
import math
import time
from dataclasses import dataclass


@dataclass
class ReplayDetectionResult:
    label: str        # CLEAR / REPLAY_SUSPECTED / REPLAY_DETECTED / INCONCLUSIVE / MODEL_UNAVAILABLE
    replay_probability: float | None
    audio_integrity_score: float | None   # 0-1, higher = cleaner audio
    reasons: list[str]
    model_name: str
    inference_time_ms: int
    is_heuristic: bool = True


def detect_replay(
    spectral_flatness=None,
    zcr: float | None = None,
    rms: float | None = None,
    spectral_rolloff: float | None = None,
    sample_rate: int | None = None,
    duration_ms: int | None = None,
    **kwargs,
) -> ReplayDetectionResult:
    """
    Heuristic replay attack detection.
    Accepts an AudioFeatures object or individual feature metrics.
    """
    if hasattr(spectral_flatness, "spectral_flatness"):
        feat = spectral_flatness
        spectral_flatness = feat.spectral_flatness
        zcr = feat.zcr
        rms = feat.rms
        spectral_rolloff = getattr(feat, "spectral_rolloff", 0.0)
        sample_rate = getattr(feat, "sample_rate", 16000)
        duration_ms = getattr(feat, "duration_ms", 1000)

    spectral_flatness = spectral_flatness or 0.0
    zcr = zcr or 0.0
    rms = rms or 0.0
    spectral_rolloff = spectral_rolloff or 0.0
    sample_rate = sample_rate or 16000
    duration_ms = duration_ms or 1000
    t0 = time.monotonic()
    reasons = []
    replay_score = 0.0

    # --- Duration check ---
    if duration_ms < 500:
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return ReplayDetectionResult(
            label="INCONCLUSIVE",
            replay_probability=None,
            audio_integrity_score=None,
            reasons=["Audio too short for replay analysis"],
            model_name="heuristic-replay-v1 (DEMO)",
            inference_time_ms=elapsed_ms,
            is_heuristic=True,
        )

    # --- Sample rate analysis ---
    # Replay attacks often involve resampling artifacts
    if sample_rate < 8000:
        replay_score += 0.30
        reasons.append(f"Low sample rate ({sample_rate} Hz) — possible resampling/compression artifact")
    elif sample_rate < 16000:
        replay_score += 0.10
        reasons.append(f"Below-standard sample rate ({sample_rate} Hz)")

    # --- Energy level consistency ---
    # Replay audio often has unusually flat or very low energy
    if rms < 0.005:
        replay_score += 0.25
        reasons.append("Abnormally low audio energy — possible far-field replay")
    elif rms > 0.7:
        replay_score += 0.15
        reasons.append("Unusually high energy — possible close-mic replay attack")

    # --- Spectral rolloff analysis ---
    # Replayed audio through speaker often loses high-frequency content
    if spectral_rolloff > 0 and spectral_rolloff < 2000:
        replay_score += 0.25
        reasons.append(f"Very low spectral rolloff ({spectral_rolloff:.0f} Hz) — possible acoustic replay through speaker")
    elif spectral_rolloff < 4000:
        replay_score += 0.10
        reasons.append(f"Low spectral rolloff ({spectral_rolloff:.0f} Hz) — bandwidth may be limited")

    # --- ZCR consistency ---
    # Replay through speaker can cause unusual ZCR patterns
    if zcr < 0.005:
        replay_score += 0.20
        reasons.append("Near-zero zero-crossing rate — possible replay artifact or silence injection")

    # --- Spectral flatness ---
    # Near-perfect flatness could indicate generated or heavily processed audio
    if spectral_flatness > 0.80:
        replay_score += 0.15
        reasons.append("Suspiciously uniform spectrum — possible synthetic source replayed")

    # Compute audio integrity (inverse of replay score)
    replay_score = max(0.0, min(1.0, replay_score))
    integrity = 1.0 - replay_score

    if replay_score < 0.20:
        label = "CLEAR"
    elif replay_score < 0.40:
        label = "INCONCLUSIVE"
    elif replay_score < 0.65:
        label = "REPLAY_SUSPECTED"
    else:
        label = "REPLAY_DETECTED"

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    return ReplayDetectionResult(
        label=label,
        replay_probability=round(replay_score, 4),
        audio_integrity_score=round(integrity, 4),
        reasons=reasons if reasons else ["No replay indicators detected"],
        model_name="heuristic-replay-v1 (DEMO)",
        inference_time_ms=elapsed_ms,
        is_heuristic=True,
    )
