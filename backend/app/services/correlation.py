"""
Correlation ID generator and validator for VoxShield AI transactions.
Format: VX-2026-XXXXXX (e.g. VX-2026-A1B2C3)
"""
import re
import secrets

CORRELATION_REGEX = re.compile(r"^VX-2026-[A-F0-9]{6}$")


def generate_correlation_id() -> str:
    """Generate unique SIH transaction correlation ID."""
    hex_suffix = secrets.token_hex(3).upper()  # 6 hex chars
    return f"VX-2026-{hex_suffix}"


def is_valid_correlation_id(correlation_id: str) -> bool:
    """Verify format compliance for correlation ID."""
    if not correlation_id or not isinstance(correlation_id, str):
        return False
    return bool(CORRELATION_REGEX.match(correlation_id.strip()))
