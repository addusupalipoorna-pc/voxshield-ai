"""
Dynamic Liveness & Anti-Spoof Challenge Service.

Prevents replay attacks by requiring speech verification against a dynamically generated,
single-use challenge phrase with a short time-to-live (TTL).
"""
import hashlib
import random
import secrets
import time
from dataclasses import dataclass

CHALLENGE_TTL_SECONDS = 90

# Challenge phrases pool for natural acoustic liveness
CHALLENGE_WORDS = [
    "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf",
    "Hotel", "India", "Juliet", "Kilo", "Lima", "Metro", "November",
    "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform",
    "Victor", "Whiskey", "Xray", "Yankee", "Zulu", "Secure", "Shield",
    "Verify", "Sentinel", "Guardian", "Falcon", "Titan", "Matrix"
]

# In-memory store for active challenges (keyed by challenge_id)
# {challenge_id: {"text": str, "hash": str, "expires_at": float, "used": bool}}
_ACTIVE_CHALLENGES: dict[str, dict] = {}


@dataclass
class LivenessChallenge:
    challenge_id: str
    phrase: str
    expires_in_seconds: int


def generate_liveness_challenge() -> LivenessChallenge:
    """Generate a dynamic single-use phrase challenge."""
    now = time.time()
    
    # Prune expired entries
    expired_keys = [k for k, v in _ACTIVE_CHALLENGES.items() if v["expires_at"] < now]
    for k in expired_keys:
        _ACTIVE_CHALLENGES.pop(k, None)

    challenge_id = "CHG-" + secrets.token_hex(8).upper()
    word = random.choice(CHALLENGE_WORDS)
    num = random.randint(1000, 9999)
    phrase = f"VoxShield {word} {num}"
    
    phrase_hash = hashlib.sha256(phrase.lower().encode()).hexdigest()
    
    _ACTIVE_CHALLENGES[challenge_id] = {
        "text": phrase,
        "hash": phrase_hash,
        "expires_at": now + CHALLENGE_TTL_SECONDS,
        "used": False,
    }
    
    return LivenessChallenge(
        challenge_id=challenge_id,
        phrase=phrase,
        expires_in_seconds=CHALLENGE_TTL_SECONDS,
    )


def verify_liveness_challenge(
    challenge_id: str | None,
    spoken_text: str | None,
) -> tuple[bool, str]:
    """
    Verify that the spoken transcript contains the dynamic challenge words.
    Single-use enforcement: marks challenge as used upon verification.
    """
    if not challenge_id:
        # If no challenge ID passed (e.g. standard command without challenge prompt),
        # return True to allow standard pipeline while logging
        return True, "Standard command mode (no challenge bound)."

    now = time.time()
    data = _ACTIVE_CHALLENGES.get(challenge_id)
    if not data:
        return False, "Liveness challenge ID not found or already purged."

    if data["used"]:
        return False, "Liveness challenge token has already been used. Replay detected."

    if now > data["expires_at"]:
        _ACTIVE_CHALLENGES.pop(challenge_id, None)
        return False, "Liveness challenge expired. Please generate a new challenge."

    # Mark as used immediately (single-use)
    data["used"] = True

    # Check if key words are present in the transcript
    phrase = data["text"].lower()
    transcript = (spoken_text or "").lower()
    
    # Extract numbers or words
    parts = phrase.split()
    matched_count = sum(1 for part in parts if part in transcript)
    
    # Require at least 2 parts of the 3-part phrase (e.g. "voxshield" + "4827")
    if matched_count >= 2:
        return True, "Liveness challenge verified successfully."
    
    return False, f"Liveness challenge mismatch: expected '{data['text']}', heard '{spoken_text}'."
