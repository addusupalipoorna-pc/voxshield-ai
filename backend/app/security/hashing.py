"""
Password hashing using native bcrypt.
Plaintext passwords are NEVER stored or logged.
"""
import bcrypt


def hash_password(plain: str) -> str:
    """Return bcrypt hash of the plaintext password."""
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if the plaintext matches the stored hash."""
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False
