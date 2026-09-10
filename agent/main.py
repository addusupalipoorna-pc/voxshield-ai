"""
VoxShield Laptop Agent — Command Executor
Polls the VoxShield backend for approved commands and executes them locally.

SECURITY CONTRACT:
- Only executes commands from the strict ALLOWED_COMMANDS allowlist
- Never evaluates arbitrary strings as shell commands
- Reports all executions back to backend with device attribution
- Atomically claims commands via /agent/claim before execution
- Requires a valid agent device token or master authorization
"""
import os
import sys
import time
import json
import logging
import subprocess
import webbrowser
import platform
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [VoxShield Agent] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
BACKEND_URL = os.environ.get("VOXSHIELD_BACKEND", "http://127.0.0.1:8000")
AGENT_TOKEN = os.environ.get("VOXSHIELD_AGENT_TOKEN", "INSECURE-AGENT-TOKEN")
CREDENTIALS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "device_credentials.json")
POLL_INTERVAL_SECONDS = 2
HEARTBEAT_INTERVAL_SECONDS = 20
MAX_RETRIES = 3

IS_WINDOWS = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"


# ── Device Credentials Management ─────────────────────────────────────────────
def load_device_credentials() -> dict:
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Could not read %s: %s", CREDENTIALS_FILE, e)
    return {}


def save_device_credentials(creds: dict):
    try:
        with open(CREDENTIALS_FILE, "w", encoding="utf-8") as f:
            json.dump(creds, f, indent=2)
        logger.info("Saved device credentials to %s", CREDENTIALS_FILE)
    except Exception as e:
        logger.error("Failed to save credentials: %s", e)


def register_device_flow():
    """Interactive device registration flow."""
    print("=" * 60)
    print("VoxShield Agent — Device Registration")
    print("=" * 60)
    dev_name = input("Enter a name for this machine (e.g. Windows Laptop): ").strip() or "Laptop Agent"
    token = input("Enter device token (or press Enter to use default dev token): ").strip()
    device_id = input("Enter device ID (or press Enter for auto-generated): ").strip()

    if not device_id:
        import uuid
        device_id = str(uuid.uuid4())

    creds = {
        "device_name": dev_name,
        "device_id": device_id,
        "device_token": token or AGENT_TOKEN,
        "platform": platform.system().lower(),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    save_device_credentials(creds)
    print(f"Device configured! ID: {device_id}")
    return creds


# ── Allowlisted Command Executors ─────────────────────────────────────────────
# Each entry maps an intent to a safe execution function.
# NEVER add generic shell execution here.

def _open_whatsapp(_params: dict):
    """Open WhatsApp — try desktop app protocol first, fall back to web."""
    if IS_WINDOWS:
        try:
            os.startfile("whatsapp:")
            return True, "WhatsApp desktop opened"
        except Exception:
            pass
    webbrowser.open("https://web.whatsapp.com")
    return True, "WhatsApp Web opened in browser"


def _open_chrome(_params: dict):
    if IS_WINDOWS:
        try:
            os.startfile("chrome.exe")
            return True, "Chrome opened"
        except Exception:
            paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ]
            for p in paths:
                if os.path.exists(p):
                    os.startfile(p)
                    return True, "Chrome opened"
    webbrowser.open("https://www.google.com")
    return True, "Browser opened"


def _open_youtube(_params: dict):
    webbrowser.open("https://www.youtube.com")
    return True, "YouTube opened in browser"


def _open_google_maps(_params: dict):
    webbrowser.open("https://maps.google.com")
    return True, "Google Maps opened in browser"


def _open_calculator(_params: dict):
    if IS_WINDOWS:
        try:
            os.startfile("calc.exe")
            return True, "Calculator opened"
        except Exception:
            subprocess.Popen(["calc.exe"], shell=False)
            return True, "Calculator opened"
    elif IS_MAC:
        subprocess.Popen(["open", "-a", "Calculator"])
        return True, "Calculator opened"
    else:
        webbrowser.open("https://www.google.com/search?q=calculator")
        return True, "Calculator (web) opened"


def _open_notepad(_params: dict):
    if IS_WINDOWS:
        # Clean up any orphaned background Notepad processes that have no window
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Process -Name notepad -ErrorAction SilentlyContinue | Where-Object { [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } | Stop-Process -Force -ErrorAction SilentlyContinue"],
                capture_output=True,
                timeout=4
            )
        except Exception:
            pass

        # Windows 11 modern Store Notepad activates cleanly via shell:AppsFolder
        try:
            os.startfile("shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App")
            return True, "Notepad opened"
        except Exception:
            pass

        try:
            subprocess.Popen(["cmd.exe", "/c", "start", "", "shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"], shell=False)
            return True, "Notepad opened"
        except Exception:
            pass

        try:
            os.startfile("notepad.exe")
            return True, "Notepad opened"
        except Exception:
            subprocess.Popen(["notepad.exe"], shell=False)
            return True, "Notepad opened"
    elif IS_MAC:
        subprocess.Popen(["open", "-a", "TextEdit"])
        return True, "TextEdit opened"
    else:
        for editor in ["gedit", "kate", "nano"]:
            try:
                subprocess.Popen([editor])
                return True, f"{editor} opened"
            except FileNotFoundError:
                continue
        return False, "No text editor found"


def _open_file_explorer(_params: dict):
    if IS_WINDOWS:
        try:
            os.startfile("explorer.exe")
            return True, "File Explorer opened"
        except Exception:
            subprocess.Popen(["explorer.exe"], shell=False)
            return True, "File Explorer opened"
    elif IS_MAC:
        subprocess.Popen(["open", os.path.expanduser("~")])
        return True, "Finder opened"
    else:
        for fm in ["nautilus", "dolphin", "thunar", "nemo"]:
            try:
                subprocess.Popen([fm])
                return True, f"{fm} opened"
            except FileNotFoundError:
                continue
        return False, "No file manager found"


def _open_settings(_params: dict):
    if IS_WINDOWS:
        try:
            os.startfile("ms-settings:")
            return True, "Settings opened"
        except Exception:
            subprocess.Popen(["explorer.exe", "ms-settings:"], shell=False)
            return True, "Settings opened"
    elif IS_MAC:
        subprocess.Popen(["open", "-a", "System Preferences"])
        return True, "System Preferences opened"
    else:
        webbrowser.open("https://settings.google.com")
        return True, "Settings (web) opened"


def _open_email(_params: dict):
    webbrowser.open("https://mail.google.com")
    return True, "Gmail opened in browser"


def _lock_screen(_params: dict):
    if IS_WINDOWS:
        subprocess.Popen(["rundll32.exe", "user32.dll,LockWorkStation"], shell=False)
        return True, "Screen locked"
    elif IS_MAC:
        subprocess.Popen(["/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession", "-suspend"])
        return True, "Screen locked"
    return False, "Lock screen not supported on this platform"


# ── Intent → Executor Map (strictly controlled) ───────────────────────────────
ALLOWED_COMMANDS = {
    "OPEN_WHATSAPP": _open_whatsapp,
    "OPEN_CHROME": _open_chrome,
    "OPEN_YOUTUBE": _open_youtube,
    "OPEN_GOOGLE_MAPS": _open_google_maps,
    "OPEN_CALCULATOR": _open_calculator,
    "OPEN_NOTEPAD": _open_notepad,
    "OPEN_FILE_EXPLORER": _open_file_explorer,
    "OPEN_SETTINGS": _open_settings,
    "OPEN_EMAIL": _open_email,
    "LOCK_SCREEN": _lock_screen,
}


# ── API Client ────────────────────────────────────────────────────────────────
def _api_request(method: str, path: str, body: dict | None = None, creds: dict | None = None) -> dict | None:
    url = f"{BACKEND_URL}{path}"
    token = (creds or {}).get("device_token") or AGENT_TOKEN
    device_id = (creds or {}).get("device_id") or ""

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "VoxShieldAgent/1.0",
    }
    if device_id:
        headers["X-Device-Id"] = device_id

    data = json.dumps(body).encode() if body else None

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.error("HTTP %s error for %s: %s", e.code, path, e.read().decode(errors="ignore"))
        return None
    except Exception as e:
        logger.error("Request error for %s: %s", path, e)
        return None


def _execute_command(command: dict) -> tuple[bool, str]:
    intent = command.get("intent", "")
    params = {}
    try:
        params = json.loads(command.get("parameters") or "{}")
    except Exception:
        pass

    executor = ALLOWED_COMMANDS.get(intent)
    if not executor:
        logger.warning("Received non-allowlisted intent: %s — BLOCKED", intent)
        return False, f"Intent '{intent}' not in allowlist — blocked for security"

    try:
        logger.info("Executing safe allowlisted action: %s", intent)
        success, message = executor(params)
        return success, message
    except Exception as e:
        return False, f"Execution error: {str(e)}"


import threading

def _send_heartbeat(creds: dict):
    """Send heartbeat to backend to update last_seen_at and maintain ONLINE status."""
    device_id = creds.get("device_id", "")
    if not device_id:
        return
    result = _api_request("POST", "/api/v1/agent/heartbeat", {
        "device_id": device_id,
        "agent_version": "1.0.0",
        "status": "ONLINE",
    }, creds=creds)
    if result:
        logger.info("Heartbeat OK — device=%s status=ONLINE server_time=%s", device_id, result.get("server_time", "?"))
    else:
        logger.debug("Heartbeat failed (backend may be offline)")


def _start_heartbeat_thread():
    """Background daemon thread that continuously sends heartbeats every 8 seconds."""
    def _run():
        while True:
            try:
                creds = load_device_credentials()
                if creds and creds.get("device_id"):
                    _send_heartbeat(creds)
            except Exception as e:
                logger.debug("Heartbeat worker exception: %s", e)
            time.sleep(8)

    t = threading.Thread(target=_run, daemon=True, name="HeartbeatDaemon")
    t.start()
    logger.info("Started background HeartbeatDaemon thread (8s interval)")


def _poll_and_execute(creds: dict):
    """Single poll cycle — fetch pending commands, claim them, and execute them."""
    # Ensure credentials are fresh
    fresh_creds = load_device_credentials() or creds
    device_id = fresh_creds.get("device_id", "")
    query = f"?device_id={device_id}" if device_id else ""
    data = _api_request("GET", f"/api/v1/agent/pending{query}", creds=fresh_creds)
    if not data:
        return

    commands = data.get("commands", [])
    for command in commands:
        command_id = command.get("id")
        intent = command.get("intent")
        logger.info("Pending command found: %s (id=%s). Attempting to claim...", intent, command_id)

        # 1. Atomic claim
        claim_res = _api_request("POST", "/api/v1/agent/claim", {"command_id": command_id}, creds=fresh_creds)
        if not claim_res or not (claim_res.get("claimed") or claim_res.get("status") == "CLAIMED"):
            logger.warning("Failed to claim command %s: %s", command_id, claim_res)
            continue

        # 2. Execute
        success, message = _execute_command(command)
        logger.info("Execution complete: success=%s, message=%s", success, message)

        # 3. Acknowledge
        _api_request("POST", "/api/v1/agent/ack", {
            "command_id": command_id,
            "device_id": device_id,
            "success": success,
            "message": message,
        }, creds=fresh_creds)


def main():
    global BACKEND_URL
    parser = argparse.ArgumentParser(description="VoxShield AI Laptop Agent")
    parser.add_argument("--register", action="store_true", help="Run interactive device registration flow")
    parser.add_argument("--gui", action="store_true", help="Launch desktop GUI window with CONTINUE button")
    parser.add_argument("--server", type=str, default=None, help="Backend URL (e.g. https://voxshield-backend.onrender.com)")
    args = parser.parse_args()

    if args.server:
        BACKEND_URL = args.server.rstrip("/")

    if args.gui:
        try:
            from agent.agent_gui import main as run_gui
        except ImportError:
            from agent_gui import main as run_gui
        run_gui()
        return

    creds = load_device_credentials()
    if args.register or not creds:
        if args.register or sys.stdin.isatty():
            creds = register_device_flow()
        else:
            creds = {"device_id": "50a4787c-0171-4b35-b66f-d77a1405c305", "device_token": AGENT_TOKEN}

    logger.info("=" * 60)
    logger.info("VoxShield Laptop Agent starting")
    logger.info("Backend: %s", BACKEND_URL)
    logger.info("Device ID: %s", creds.get("device_id", "unregistered"))
    logger.info("Platform: %s", platform.system())
    logger.info("Allowlisted commands: %s", list(ALLOWED_COMMANDS.keys()))
    logger.info("Poll interval: %ss", POLL_INTERVAL_SECONDS)
    logger.info("=" * 60)

    # Immediately fire first heartbeat and start background heartbeat thread
    _send_heartbeat(creds)
    _start_heartbeat_thread()

    retry_count = 0
    while True:
        try:
            _poll_and_execute(creds)
            retry_count = 0
            time.sleep(POLL_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            logger.info("Agent stopped by user.")
            sys.exit(0)
        except Exception as e:
            retry_count += 1
            logger.error("Poll error (%d/%d): %s", retry_count, MAX_RETRIES, e)
            time.sleep(3)


if __name__ == "__main__":
    main()

