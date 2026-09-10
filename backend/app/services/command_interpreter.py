"""
Command Interpreter — Natural language to structured intent mapping.
Uses pattern/keyword matching against a strict allowlist.
NEVER generates shell commands or arbitrary code.
"""
import re
from dataclasses import dataclass, field


# ─── Allowlist with metadata ──────────────────────────────────────────────────
COMMAND_REGISTRY: dict[str, dict] = {
    "OPEN_WHATSAPP": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open WhatsApp application or web",
        "patterns": [r"open\s+whatsapp", r"launch\s+whatsapp", r"start\s+whatsapp", r"whatsapp"],
    },
    "OPEN_CHROME": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open Google Chrome browser",
        "patterns": [r"open\s+chrome", r"open\s+browser", r"launch\s+chrome", r"open\s+google\s+chrome"],
    },
    "OPEN_YOUTUBE": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open YouTube in browser",
        "patterns": [r"open\s+youtube", r"launch\s+youtube", r"play\s+youtube"],
    },
    "OPEN_GOOGLE_MAPS": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open Google Maps in browser",
        "patterns": [r"open\s+(google\s+)?maps", r"launch\s+(google\s+)?maps"],
    },
    "OPEN_CALCULATOR": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open Calculator application",
        "patterns": [r"open\s+calc(ulator)?", r"launch\s+calc(ulator)?", r"calculator"],
    },
    "OPEN_NOTEPAD": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open Notepad text editor",
        "patterns": [r"open\s+note\s*pad", r"launch\s+note\s*pad", r"open\s+text\s+editor", r"note\s*pad"],
    },
    "OPEN_FILE_EXPLORER": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open File Explorer",
        "patterns": [r"open\s+file\s+explorer", r"open\s+files", r"open\s+explorer", r"file\s+manager"],
    },
    "OPEN_SETTINGS": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open System Settings",
        "patterns": [r"open\s+settings", r"open\s+system\s+settings", r"launch\s+settings"],
    },
    "OPEN_EMAIL": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Open email client",
        "patterns": [r"open\s+(my\s+)?email", r"open\s+mail", r"launch\s+email"],
    },
    "SEND_EMAIL": {
        "risk": "HIGH",
        "requires_approval": True,
        "description": "Compose and send an email",
        "patterns": [r"send\s+(an?\s+)?email", r"email\s+to\s+\w+", r"send\s+mail"],
    },
    "DRAFT_EMAIL": {
        "risk": "MEDIUM",
        "requires_approval": True,
        "description": "Draft an email",
        "patterns": [r"draft\s+(an?\s+)?email", r"compose\s+(an?\s+)?email", r"write\s+(an?\s+)?email"],
    },
    "SEND_WHATSAPP": {
        "risk": "HIGH",
        "requires_approval": True,
        "description": "Send a WhatsApp message",
        "patterns": [r"send\s+(a\s+)?whatsapp", r"whatsapp\s+(message\s+)?to\s+\w+", r"message\s+to\s+\w+\s+on\s+whatsapp"],
    },
    "LOCK_SCREEN": {
        "risk": "LOW",
        "requires_approval": False,
        "description": "Lock the computer screen",
        "patterns": [r"lock\s+(the\s+)?(screen|computer|system|workstation|laptop)", r"lock\s+workstation", r"lock\s+this", r"^lock$"],
    },
    "SHUTDOWN": {
        "risk": "CRITICAL",
        "requires_approval": True,
        "description": "Shut down the computer",
        "patterns": [r"shut\s*down", r"power\s+off", r"turn\s+off\s+(the\s+)?(computer|laptop|system)"],
    },
    "DELETE_FILE": {
        "risk": "CRITICAL",
        "requires_approval": True,
        "description": "Delete a file or folder",
        "patterns": [
            r"delete\s+.*file",
            r"delete\s+.*folder",
            r"remove\s+.*file",
            r"delete\s+file",
            r"delete\s+.*",
            r"remove\s+.*",
            r"erase\s+.*",
            r"drop\s+.*",
        ],
    },
}


@dataclass
class CommandResult:
    intent: str
    risk: str                               # LOW / MEDIUM / HIGH / CRITICAL
    requires_approval: bool
    description: str
    parameters: dict = field(default_factory=dict)
    is_allowed: bool = True
    rejection_reason: str | None = None
    raw_transcript: str = ""
    confidence: float = 1.0

    def __getitem__(self, item: str):
        if item == "risk_level":
            return self.risk
        return getattr(self, item)

    @property
    def risk_level(self) -> str:
        return self.risk



def interpret_command(transcript: str) -> CommandResult:
    """
    Map natural language transcript to a structured, allowlisted command intent.
    Returns UNKNOWN intent if no match found.
    NEVER generates shell commands.
    """
    if not transcript or not transcript.strip():
        return CommandResult(
            intent="UNKNOWN",
            risk="HIGH",
            requires_approval=False,
            description="Empty transcript",
            is_allowed=False,
            rejection_reason="No speech detected or transcript is empty.",
            raw_transcript=transcript,
        )

    text = transcript.lower().strip()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    best_match: str | None = None

    for intent, meta in COMMAND_REGISTRY.items():
        for pattern in meta["patterns"]:
            if re.search(pattern, text):
                best_match = intent
                break
        if best_match:
            break

    if not best_match:
        return CommandResult(
            intent="UNKNOWN",
            risk="HIGH",
            requires_approval=False,
            description="Unrecognized command",
            is_allowed=False,
            rejection_reason=f"Command not in allowlist. Supported: {', '.join(COMMAND_REGISTRY.keys())}",
            raw_transcript=transcript,
        )

    meta = COMMAND_REGISTRY[best_match]
    return CommandResult(
        intent=best_match,
        risk=meta["risk"],
        requires_approval=meta["requires_approval"],
        description=meta["description"],
        is_allowed=True,
        raw_transcript=transcript,
        confidence=0.92,
    )


ALLOWLISTED_COMMANDS = list(COMMAND_REGISTRY.keys())
