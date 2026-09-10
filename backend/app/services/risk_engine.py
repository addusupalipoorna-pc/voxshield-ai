"""
Risk Engine — Weighted multi-factor risk scoring.
Combines deepfake, speaker verification, replay, and command risk
into a single 0–100 score and ALLOW/VERIFY/BLOCK decision.

Weights are configurable. Demo defaults are NOT calibrated security standards.
"""
from dataclasses import dataclass, field


# ── Configurable weights (demo defaults) ──────────────────────────────────────
DEFAULT_WEIGHTS = {
    "voice_authenticity": 0.30,   # deepfake detection
    "speaker_verification": 0.25, # speaker match
    "replay_detection": 0.20,     # replay/spoof
    "audio_quality": 0.10,        # audio integrity
    "command_risk": 0.15,         # command risk level
}

# ── Risk thresholds ───────────────────────────────────────────────────────────
SAFE_MAX = 30
CAUTION_MAX = 60
HIGH_MAX = 80
# CRITICAL: 81-100


@dataclass
class RiskFactor:
    name: str
    score: float       # 0-100, higher = riskier
    weight: float
    label: str
    contribution: float = field(init=False)

    def __post_init__(self):
        self.contribution = self.score * self.weight


@dataclass
class RiskResult:
    total_score: float          # 0-100
    risk_level: str             # SAFE / CAUTION / HIGH / CRITICAL
    decision: str               # ALLOW / VERIFY / BLOCK
    factors: list[RiskFactor]
    reasons: list[str]
    weights_used: dict
    is_available: bool = True


def _deepfake_risk_score(deepfake_label: str, synthetic_prob: float | None) -> float:
    """Convert deepfake label → 0-100 risk contribution."""
    label_scores = {
        "LIKELY_GENUINE": 5.0,
        "INCONCLUSIVE": 45.0,
        "SUSPICIOUS": 70.0,
        "LIKELY_SYNTHETIC": 90.0,
        "MODEL_UNAVAILABLE": 50.0,  # Neutral when unavailable
        "HEURISTIC_ONLY": 40.0,
    }
    base = label_scores.get(deepfake_label, 50.0)
    if synthetic_prob is not None:
        # Blend with actual probability
        return base * 0.4 + synthetic_prob * 100 * 0.6
    return base


def _speaker_risk_score(speaker_label: str, similarity: float | None) -> float:
    """Convert speaker verification label → 0-100 risk contribution."""
    label_scores = {
        "MATCH": 5.0,
        "VERIFIED": 5.0,
        "INCONCLUSIVE": 60.0,
        "MISMATCH": 90.0,
        "UNKNOWN": 95.0,
        "NO_PROFILE": 60.0,
        "MODEL_UNAVAILABLE": 50.0,
    }
    base = label_scores.get(speaker_label, 50.0)
    if similarity is not None:
        # Invert similarity (0=mismatch → 100 risk, 1=match → 0 risk)
        sim_score = (1.0 - similarity) * 100
        return base * 0.3 + sim_score * 0.7
    return base


def _replay_risk_score(replay_label: str, replay_prob: float | None) -> float:
    """Convert replay label → 0-100 risk contribution."""
    label_scores = {
        "CLEAR": 5.0,
        "INCONCLUSIVE": 40.0,
        "REPLAY_SUSPECTED": 65.0,
        "REPLAY_DETECTED": 90.0,
        "MODEL_UNAVAILABLE": 35.0,
    }
    base = label_scores.get(replay_label, 40.0)
    if replay_prob is not None:
        return base * 0.3 + replay_prob * 100 * 0.7
    return base


def _command_risk_score(command_risk: str) -> float:
    """Convert command risk label → 0-100 risk contribution."""
    return {
        "LOW": 10.0,
        "MEDIUM": 40.0,
        "HIGH": 70.0,
        "CRITICAL": 95.0,
        "UNKNOWN": 50.0,
    }.get(command_risk, 30.0)


def _audio_quality_risk(rms: float, is_valid: bool) -> float:
    if not is_valid:
        return 70.0
    if rms < 0.002:
        return 60.0
    if rms < 0.01:
        return 30.0
    return 10.0


def compute_risk(
    deepfake_label: str = "MODEL_UNAVAILABLE",
    synthetic_prob: float | None = None,
    speaker_label: str = "NO_PROFILE",
    speaker_similarity: float | None = None,
    replay_label: str = "MODEL_UNAVAILABLE",
    replay_probability: float | None = None,
    command_risk: str = "LOW",
    audio_rms: float = 0.1,
    audio_valid: bool = True,
    weights: dict | None = None,
    **kwargs,
) -> RiskResult:
    """Compute weighted risk score from all pipeline inputs."""
    if "replay_prob" in kwargs and replay_probability is None:
        replay_probability = kwargs["replay_prob"]
    if "audio_is_valid" in kwargs:
        audio_valid = kwargs["audio_is_valid"]
    if "speaker_match" in kwargs and speaker_label == "NO_PROFILE":
        speaker_label = "MATCH" if kwargs["speaker_match"] else "MISMATCH"

    w = weights or DEFAULT_WEIGHTS
    reasons = []

    # ── Compute individual risk scores ────────────────────────────────────────
    df_score = _deepfake_risk_score(deepfake_label, synthetic_prob)
    sv_score = _speaker_risk_score(speaker_label, speaker_similarity)
    rp_score = _replay_risk_score(replay_label, replay_probability)
    cmd_score = _command_risk_score(command_risk)
    aq_score = _audio_quality_risk(audio_rms, audio_valid)

    # ── Build factors ─────────────────────────────────────────────────────────
    factors = [
        RiskFactor("Voice Authenticity", df_score, w.get("voice_authenticity", 0.30), deepfake_label),
        RiskFactor("Speaker Verification", sv_score, w.get("speaker_verification", 0.25), speaker_label),
        RiskFactor("Replay Detection", rp_score, w.get("replay_detection", 0.20), replay_label),
        RiskFactor("Audio Quality", aq_score, w.get("audio_quality", 0.10), "OK" if audio_valid else "INVALID"),
        RiskFactor("Command Risk", cmd_score, w.get("command_risk", 0.15), command_risk),
    ]

    # ── Weighted total ─────────────────────────────────────────────────────────
    total = sum(f.contribution for f in factors)
    total = max(0.0, min(100.0, total))

    # ── Risk level ────────────────────────────────────────────────────────────
    if total <= SAFE_MAX:
        risk_level = "SAFE"
    elif total <= CAUTION_MAX:
        risk_level = "CAUTION"
    elif total <= HIGH_MAX:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    # ── Decision ──────────────────────────────────────────────────────────────
    # Hard blocks regardless of total score
    if deepfake_label in ("LIKELY_SYNTHETIC",):
        decision = "BLOCK"
        reasons.append("Voice detected as likely synthetic")
    elif speaker_label == "MISMATCH":
        decision = "BLOCK"
        reasons.append("Speaker does not match enrolled profile")
    elif replay_label == "REPLAY_DETECTED":
        decision = "BLOCK"
        reasons.append("Replay attack detected")
    elif risk_level == "CRITICAL":
        decision = "BLOCK"
        reasons.append("Critical risk score")
    elif risk_level == "HIGH" or command_risk in ("HIGH", "CRITICAL"):
        decision = "VERIFY"
        if command_risk in ("HIGH", "CRITICAL"):
            reasons.append(f"Command risk level: {command_risk}")
        if risk_level == "HIGH":
            reasons.append("High overall risk score")
    elif risk_level == "CAUTION":
        decision = "VERIFY" if command_risk != "LOW" else "ALLOW"
    else:
        decision = "ALLOW"

    # Additional reason annotations
    if deepfake_label in ("SUSPICIOUS", "INCONCLUSIVE"):
        reasons.append(f"Voice authenticity: {deepfake_label}")
    if speaker_label in ("INCONCLUSIVE", "NO_PROFILE"):
        reasons.append(f"Speaker verification: {speaker_label}")

    return RiskResult(
        total_score=round(total, 1),
        risk_level=risk_level,
        decision=decision,
        factors=factors,
        reasons=reasons if reasons else ["No significant risk factors detected"],
        weights_used=w,
        is_available=True,
    )
