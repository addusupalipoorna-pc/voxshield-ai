"""
Command Parameter Validator & Sanitizer.

Prevents:
- Path traversal (e.g. '../../')
- Shell injection metacharacters (;, &, |, `, $, >, <, \n)
- Arbitrary script/URL injection (javascript:, file:, data:)
- Malformed inputs
"""
import re
from urllib.parse import urlparse

# Disallow shell metacharacters and control operators
DANGEROUS_SHELL_PATTERN = re.compile(r"[\x00-\x1f;`\$><|&!\\]")

# Disallow path traversal
PATH_TRAVERSAL_PATTERN = re.compile(r"(\.\./|\.\.\\|\.\.)")

# Allowed URL schemes
ALLOWED_URL_SCHEMES = {"http", "https"}


def sanitize_text(text: str | None, max_length: int = 500) -> str:
    """Sanitize general text parameters (titles, messages, keywords)."""
    if not text:
        return ""
    # Strip dangerous characters
    cleaned = DANGEROUS_SHELL_PATTERN.sub("", text)
    cleaned = cleaned.strip()
    return cleaned[:max_length]


def validate_url(url: str) -> tuple[bool, str]:
    """Validate URLs for browser commands."""
    if not url:
        return False, "URL cannot be empty."
    
    if DANGEROUS_SHELL_PATTERN.search(url):
        return False, "URL contains illegal shell metacharacters."
    
    try:
        parsed = urlparse(url)
        if parsed.scheme.lower() not in ALLOWED_URL_SCHEMES:
            return False, f"Invalid URL scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed."
        if not parsed.netloc:
            return False, "Malformed URL missing host domain."
        return True, url
    except Exception as exc:
        return False, f"Invalid URL structure: {exc}"


def validate_file_path(path: str) -> tuple[bool, str]:
    """Validate paths to prevent directory traversal or arbitrary drive access."""
    if not path:
        return False, "File path cannot be empty."
    
    if DANGEROUS_SHELL_PATTERN.search(path):
        return False, "File path contains illegal characters."
    
    if PATH_TRAVERSAL_PATTERN.search(path):
        return False, "Directory traversal (..) is strictly prohibited."
    
    # Check for root/system path attempts
    lower_path = path.lower()
    blocked_roots = ["/etc", "/var", "/bin", "/usr", "/root", "c:\\windows", "c:\\system32"]
    for b in blocked_roots:
        if lower_path.startswith(b):
            return False, f"Access to system folder '{b}' is blocked by security policy."
            
    return True, path


def validate_command_parameters(intent: str, parameters: dict | None) -> tuple[bool, str, dict]:
    """
    Validates and sanitizes parameters for the specified command intent.
    Returns: (is_valid, error_message, sanitized_parameters)
    """
    params = parameters or {}
    sanitized: dict = {}

    if intent in ("OPEN_CHROME", "OPEN_BROWSER", "OPEN_YOUTUBE", "OPEN_GOOGLE_MAPS"):
        url = params.get("url")
        if url:
            valid, err = validate_url(url)
            if not valid:
                return False, err, {}
            sanitized["url"] = err
            
    elif intent in ("OPEN_FILE", "DELETE_FILE", "SHARE_FILE"):
        path = params.get("path")
        if path:
            valid, err = validate_file_path(path)
            if not valid:
                return False, err, {}
            sanitized["path"] = err

    elif intent in ("SEND_EMAIL", "SEND_MESSAGE", "OPEN_WHATSAPP"):
        recipient = params.get("recipient")
        if recipient:
            sanitized["recipient"] = sanitize_text(recipient, max_length=120)
        message = params.get("message")
        if message:
            sanitized["message"] = sanitize_text(message, max_length=1000)

    # General parameter pass-through after sanitizing string values
    for k, v in params.items():
        if k not in sanitized:
            if isinstance(v, str):
                if DANGEROUS_SHELL_PATTERN.search(v):
                    return False, f"Parameter '{k}' contains illegal shell characters.", {}
                sanitized[k] = sanitize_text(v)
            else:
                sanitized[k] = v

    return True, "", sanitized
