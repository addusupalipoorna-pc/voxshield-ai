"""
Speaker Verification Service — Cosine similarity of MFCC feature vectors.

Uses heuristic cosine similarity between the enrolled MFCC vector
(stored in speaker_profiles.feature_vector_json) and the incoming audio.

Clearly labeled as heuristic — not a trained neural speaker embedding model (e.g. ECAPA-TDNN).
"""
import json
import math
import time
from dataclasses import dataclass

# Thresholds — calibrated for vocal tract timbre MFCC comparison (c1..c12)
# Thresholds — calibrated for vocal tract timbre MFCC comparison (c1..c12)
MATCH_THRESHOLD = 0.88         # >= 0.88 → VERIFIED / MATCH
INCONCLUSIVE_THRESHOLD = 0.78  # 0.78–0.87 → INCONCLUSIVE / UNKNOWN


@dataclass
class SpeakerVerificationResult:
    label: str            # MATCH / MISMATCH / INCONCLUSIVE / NO_PROFILE / MODEL_UNAVAILABLE
    similarity: float | None
    model_name: str
    model_version: str
    inference_time_ms: int


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """
    Biometric vocal tract resonance comparison.
    Mean-centered Pearson correlation over formant coefficients c[1..12].
    Removes shared overall power tilt and isolates true vocal tract resonance poles.
    """
    if not a or not b:
        return 0.0
    vec_a = a[1:] if len(a) > 1 else a
    vec_b = b[1:] if len(b) > 1 else b
    n = min(len(vec_a), len(vec_b))
    if n == 0:
        return 0.0
    va = vec_a[:n]
    vb = vec_b[:n]
    ma = sum(va) / n
    mb = sum(vb) / n
    ca = [x - ma for x in va]
    cb = [x - mb for x in vb]
    dot = sum(x * y for x, y in zip(ca, cb))
    norm_a = math.sqrt(sum(x * x for x in ca))
    norm_b = math.sqrt(sum(x * x for x in cb))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    raw_sim = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, raw_sim))


def verify_speaker(
    incoming_mfcc: list[float],
    enrolled_feature_json: str | None,
) -> SpeakerVerificationResult:
    """
    Compare incoming audio MFCC with enrolled MFCC via cosine similarity.

    Args:
        incoming_mfcc: MFCC vector from extract_features()
        enrolled_feature_json: JSON string of enrolled mfcc_vector from speaker_profile
    """
    t0 = time.monotonic()

    if not enrolled_feature_json:
        return SpeakerVerificationResult(
            label="NO_PROFILE",
            similarity=None,
            model_name="heuristic-cosine-v1",
            model_version="1.0.0",
            inference_time_ms=0,
        )

    try:
        enrolled_mfcc: list[float] = json.loads(enrolled_feature_json)
    except (json.JSONDecodeError, TypeError, ValueError):
        return SpeakerVerificationResult(
            label="NO_PROFILE",
            similarity=None,
            model_name="heuristic-cosine-v1",
            model_version="1.0.0",
            inference_time_ms=0,
        )

    similarity = _cosine_similarity(incoming_mfcc, enrolled_mfcc)
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    if similarity >= MATCH_THRESHOLD:
        label = "MATCH"
    elif similarity >= INCONCLUSIVE_THRESHOLD:
        label = "INCONCLUSIVE"
    else:
        label = "MISMATCH"

    return SpeakerVerificationResult(
        label=label,
        similarity=round(similarity, 4),
        model_name="heuristic-cosine-v1",
        model_version="1.0.0",
        inference_time_ms=elapsed_ms,
    )


@dataclass
class SpeakerIdentificationResult:
    identified_user_id: str | None
    identified_name: str
    match_score: float               # 0.0 - 100.0%
    similarity: float | None          # 0.0 - 1.0
    label: str                       # "VERIFIED" | "INCONCLUSIVE" | "UNKNOWN" | "NO_PROFILES"
    confidence: str                  # "HIGH" | "MEDIUM" | "LOW"
    is_verified: bool
    model_name: str
    model_version: str
    inference_time_ms: int
    ranked_matches: list[dict]

    def __getitem__(self, item: str):
        if item == "identity_status":
            return self.label
        if item == "user_id":
            return self.identified_user_id
        if hasattr(self, item):
            return getattr(self, item)
        raise KeyError(item)


def identify_speaker(
    incoming_mfcc: list[float],
    enrolled_profiles: list[dict],
    threshold: float = MATCH_THRESHOLD,
) -> SpeakerIdentificationResult:
    """
    1:N Global Speaker Identification:
    Compare incoming audio MFCC across ALL enrolled profiles in the database.
    Find the best match and determine if the person is VERIFIED or UNKNOWN.

    Args:
        incoming_mfcc: Extracted feature vector of incoming speaker
        enrolled_profiles: List of dicts: [{"user_id": ..., "name": ..., "feature_vector_json": ...}]
    """
    t0 = time.monotonic()

    if not enrolled_profiles or not incoming_mfcc:
        return SpeakerIdentificationResult(
            identified_user_id=None,
            identified_name="Unknown Speaker",
            match_score=0.0,
            similarity=0.0,
            label="UNKNOWN" if incoming_mfcc else "NO_PROFILES",
            confidence="LOW",
            is_verified=False,
            model_name="heuristic-cosine-1toN",
            model_version="1.0.0",
            inference_time_ms=0,
            ranked_matches=[],
        )

    scores = []
    for p in enrolled_profiles:
        f_json = p.get("feature_vector_json")
        profile_mfcc = None
        if isinstance(p.get("feature_vector"), list):
            profile_mfcc = p.get("feature_vector")
        elif f_json:
            try:
                profile_mfcc = json.loads(f_json)
            except Exception:
                continue
        if not profile_mfcc:
            continue

        sim = _cosine_similarity(incoming_mfcc, profile_mfcc)
        scores.append({
            "user_id": p.get("user_id"),
            "name": p.get("name") or p.get("user_name", "Unknown"),
            "similarity": round(sim, 4),
            "match_score": round(sim * 100.0, 1),
        })

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    if not scores:
        return SpeakerIdentificationResult(
            identified_user_id=None,
            identified_name="Unknown Speaker",
            match_score=0.0,
            similarity=0.0,
            label="UNKNOWN",
            confidence="LOW",
            is_verified=False,
            model_name="heuristic-cosine-1toN",
            model_version="1.0.0",
            inference_time_ms=elapsed_ms,
            ranked_matches=[],
        )

    # Sort descending by similarity
    scores.sort(key=lambda x: x["similarity"], reverse=True)
    top = scores[0]
    top_sim = top["similarity"]
    top_score = top["match_score"]

    if top_sim >= threshold:
        label = "VERIFIED"
        confidence = "HIGH"
        is_verified = True
        identified_user_id = top["user_id"]
        identified_name = top["name"]
    elif top_sim >= INCONCLUSIVE_THRESHOLD:
        label = "INCONCLUSIVE"
        confidence = "MEDIUM"
        is_verified = False
        identified_user_id = None
        identified_name = "Unknown User"
    else:
        label = "UNKNOWN"
        confidence = "LOW"
        is_verified = False
        identified_user_id = None
        identified_name = "Unknown User"

    return SpeakerIdentificationResult(
        identified_user_id=identified_user_id,
        identified_name=identified_name,
        match_score=top_score,
        similarity=top_sim,
        label=label,
        confidence=confidence,
        is_verified=is_verified,
        model_name="heuristic-cosine-1toN",
        model_version="1.0.0",
        inference_time_ms=elapsed_ms,
        ranked_matches=scores[:5],
    )
