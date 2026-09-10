"""
Deepfake / Audio Anti-Spoofing Detector — Advanced Acoustic Signal & Biometric Analysis.

Analyzes vocal tract acoustics for characteristics of AI-generated/TTS/cloned voices:
- Robotic pitch stability & absence of natural human micro-prosody (pitch_std < 8 Hz)
- Vocoder phase noise & elevated high-frequency spectral flatness (> 3500 Hz)
- Unnatural harmonic distribution & synthetic spectral uniformity
- Zero-crossing rate quantization and temporal stiffness

DISCLAIMER: Heuristic acoustic telemetry engine labeled according to confidence.
"""
import time
from dataclasses import dataclass


@dataclass
class DeepfakeDetectionResult:
    label: str           # LIKELY_GENUINE / SUSPICIOUS / SYNTHETIC / INCONCLUSIVE / MODEL_UNAVAILABLE
    genuine_probability: float | None   # 0-1
    synthetic_probability: float | None  # 0-1
    confidence: float | None             # 0-1 confidence in the prediction
    reasons: list[str]
    model_name: str
    model_version: str
    inference_time_ms: int
    is_heuristic: bool = True            # Heuristic acoustic biometrics


def detect_deepfake(
    spectral_flatness=None,
    zcr: float | None = None,
    pitch_hz: float | None = None,
    heuristic_authenticity: float | None = None,
    rms: float | None = None,
    spectral_centroid: float | None = None,
    **kwargs,
) -> DeepfakeDetectionResult:
    """
    Acoustic anti-spoofing and deepfake detection engine.
    Accepts an AudioFeatures object or individual feature metrics.
    """
    pitch_std = 0.0
    high_freq_flatness = 0.0
    duration_ms = 1000

    if hasattr(spectral_flatness, "spectral_flatness"):
        feat = spectral_flatness
        spectral_flatness = feat.spectral_flatness
        zcr = feat.zcr
        pitch_hz = feat.pitch_hz
        heuristic_authenticity = getattr(feat, "heuristic_authenticity", 0.8)
        rms = feat.rms
        spectral_centroid = feat.spectral_centroid
        pitch_std = getattr(feat, "pitch_std", 0.0)
        high_freq_flatness = getattr(feat, "high_freq_flatness", 0.0)
        duration_ms = getattr(feat, "duration_ms", 1000)

    spectral_flatness = spectral_flatness or 0.0
    zcr = zcr or 0.0
    heuristic_authenticity = heuristic_authenticity if heuristic_authenticity is not None else 0.8
    rms = rms or 0.0
    spectral_centroid = spectral_centroid or 0.0
    t0 = time.monotonic()
    reasons = []
    suspicion_score = 0.0  # 0 = genuine, 1 = synthetic

    # --- 1. Pitch Variance & Prosody Analysis (Strongest AI/TTS Marker) ---
    if pitch_hz is None:
        suspicion_score += 0.20
        reasons.append("No detectable fundamental pitch (possible whisper synthesis or noise)")
    elif not (65 <= pitch_hz <= 550):
        suspicion_score += 0.30
        reasons.append(f"Pitch {pitch_hz:.0f} Hz outside biological human speech range (65–550 Hz)")
    else:
        # Detected pitch in human range: check micro-prosodic variation
        if duration_ms >= 500:
            if pitch_std < 8.0:
                # Synthetic / TTS voices maintain unnaturally flat pitch
                suspicion_score += 0.45
                reasons.append(f"Robotic pitch invariance detected (pitch std: {pitch_std:.1f} Hz, natural human > 14 Hz)")
            elif pitch_std < 11.5:
                suspicion_score += 0.25
                reasons.append(f"Unusually flat pitch contour (pitch std: {pitch_std:.1f} Hz)")
            elif pitch_std >= 16.0:
                # Natural human emotional and linguistic inflections
                suspicion_score -= 0.15

    # --- 2. High-Frequency Vocoder Phase Artifacts ---
    if high_freq_flatness > 0.40:
        suspicion_score += 0.35
        reasons.append(f"Vocoder synthesis phase noise detected in upper band (HF flatness: {high_freq_flatness:.3f})")
    elif high_freq_flatness > 0.28:
        suspicion_score += 0.15
        reasons.append("Elevated upper-frequency spectral noise characteristic of neural vocoders")

    # --- 3. Full-Band Spectral Flatness Analysis ---
    if spectral_flatness > 0.50:
        suspicion_score += 0.35
        reasons.append(f"Abnormally uniform spectral envelope (flatness: {spectral_flatness:.3f})")
    elif spectral_flatness > 0.38:
        suspicion_score += 0.15
        reasons.append(f"Spectral flatness above natural speech resonance ({spectral_flatness:.3f})")
    elif 0.04 <= spectral_flatness <= 0.28:
        # Healthy harmonic vocal tract formant structure
        suspicion_score -= 0.10

    # --- 4. Zero Crossing Rate (ZCR) Temporal Mechanics ---
    if zcr < 0.015:
        suspicion_score += 0.20
        reasons.append("Near-zero zero-crossing rate (possible digital audio replay or DAC artifact)")
    elif zcr > 0.38:
        suspicion_score += 0.20
        reasons.append("Excessive high-frequency zero-crossings (possible quantization buzz)")
    elif 0.03 <= zcr <= 0.22:
        suspicion_score -= 0.05

    # --- 5. Heuristic Authenticity Synthesis ---
    if heuristic_authenticity < 0.35:
        suspicion_score += 0.20
        reasons.append("Composite acoustic authenticity score is depressed")
    elif heuristic_authenticity > 0.65:
        suspicion_score -= 0.10

    # --- 6. Energy Dynamic Range ---
    if rms < 0.002:
        suspicion_score += 0.15
        reasons.append("Very low energy — possible digital silence padding")

    # Clamp score
    suspicion_score = max(0.0, min(1.0, suspicion_score))

    # Determine label
    if suspicion_score >= 0.45:
        label = "SYNTHETIC"
        synthetic_prob = max(0.85, round(suspicion_score, 4))
        genuine_prob = round(1.0 - synthetic_prob, 4)
        confidence = synthetic_prob
    elif suspicion_score >= 0.30:
        label = "SUSPICIOUS"
        synthetic_prob = round(suspicion_score, 4)
        genuine_prob = round(1.0 - synthetic_prob, 4)
        confidence = synthetic_prob
    elif suspicion_score >= 0.20:
        label = "INCONCLUSIVE"
        synthetic_prob = round(suspicion_score, 4)
        genuine_prob = round(1.0 - synthetic_prob, 4)
        confidence = 0.50
    else:
        label = "LIKELY_GENUINE"
        synthetic_prob = round(suspicion_score, 4)
        genuine_prob = round(1.0 - synthetic_prob, 4)
        confidence = genuine_prob

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    return DeepfakeDetectionResult(
        label=label,
        genuine_probability=genuine_prob,
        synthetic_probability=synthetic_prob,
        confidence=confidence,
        reasons=reasons if reasons else ["Acoustic formant harmonics and prosody match genuine human speech"],
        model_name="voxshield-acoustic-anti-spoofing-v2",
        model_version="2.1.0",
        inference_time_ms=elapsed_ms,
        is_heuristic=True,
    )
