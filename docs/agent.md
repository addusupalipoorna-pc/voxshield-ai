# VoxShield AI — Laptop Agent Reference

## Overview
The **VoxShield Laptop Agent** (`agent/main.py`) is a lightweight background daemon that runs on authorized workstations (primarily Windows). It executes allowlisted commands authorized by the central VoxShield security pipeline.

---

## 1. Setup & Registration

### Step 1: Install Dependencies
The agent requires only Python standard libraries (`urllib`, `subprocess`, `webbrowser`, `platform`, `json`). No heavy third-party packages are required.

### Step 2: Device Registration
Run the interactive registration flow:
```bash
cd agent
python main.py --register
```
1. Enter machine name (e.g. `Primary Windows Workstation`).
2. Enter the device token generated from **Settings -> Register Device** in the web UI.
3. The agent saves credentials locally into `device_credentials.json`.

---

## 2. Agent Operation
To run the agent in continuous polling mode:
```bash
python main.py
```

Environment variables:
- `VOXSHIELD_BACKEND`: URL to the FastAPI backend (default: `http://127.0.0.1:8000`).
- `VOXSHIELD_AGENT_TOKEN`: Master fallback token for local development testing (`INSECURE-AGENT-TOKEN`).

---

## 3. Communication Protocol
1. **Poll**: `GET /api/v1/agent/pending?device_id=<device_id>` every 2 seconds.
2. **Claim**: `POST /api/v1/agent/claim` with `{"command_id": "uuid"}`. If claim fails, execution is aborted.
3. **Execute**: Calls appropriate handler from `ALLOWED_COMMANDS`.
4. **Acknowledge**: `POST /api/v1/agent/ack` with `{"command_id": "uuid", "device_id": "...", "success": true, "message": "..."}`.

---

## 4. Security Sandbox
- **No Shell Interpreter**: All invocations use `subprocess.Popen(..., shell=False)`.
- **Predefined Targets**: The agent cannot run arbitrary executables. Only predefined binaries (`calc.exe`, `notepad.exe`, `explorer.exe`, Chrome paths) or URLs (`web.whatsapp.com`) are executed.
- **Fail-Safe Revocation**: If a device is revoked in the Web UI, subsequent poll or claim calls will receive `403 Forbidden` and the agent will refuse execution.
