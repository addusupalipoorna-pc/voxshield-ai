# VoxShield AI — Command Interpretation & Execution

## Overview
VoxShield bridges voice verification with controlled, local operating system execution. The security principle is absolute: **voice commands must never evaluate arbitrary shell commands on any machine.**

---

## 1. Command Pipeline Lifecycle

```text
       Spoken Audio
            │
            ▼
    [ Transcription ] (Whisper STT / Web Speech API)
            │
            ▼
 [ Command Interpreter ] (Strict Regex & Semantic Allowlist)
            │
            ├── Safe Intent (OPEN_WHATSAPP, OPEN_BROWSER) ──► Risk: LOW
            │
            └── High-Risk Intent (SEND_EMAIL, DELETE_FILE) ──► Risk: HIGH / CRITICAL
                                                                  │
                                                                  ▼
                                                      [ Step-Up Verification ]
                                                      (Cryptographic Token/OTP)
                                                                  │
                                                                  ▼
                                                              Approved
                                                                  │
                                                                  ▼
                                                    [ Command Queue (APPROVED) ]
                                                                  │
                                                    Poll & Atomic Claim
                                                                  │
                                                                  ▼
                                                    [ Laptop Agent Execution ]
                                                    (Windows Popen, shell=False)
                                                                  │
                                                                  ▼
                                                    [ Agent Acknowledgment ]
```

---

## 2. Supported Command Registry

| Intent | Risk Level | Requires Approval | Target Execution Action |
| :--- | :--- | :--- | :--- |
| `OPEN_WHATSAPP` | `LOW` | No | Launches WhatsApp Desktop app or WhatsApp Web fallback |
| `OPEN_CHROME` | `LOW` | No | Launches Google Chrome or default system browser |
| `OPEN_YOUTUBE` | `LOW` | No | Opens YouTube in default web browser |
| `OPEN_GOOGLE_MAPS` | `LOW` | No | Opens Google Maps in default web browser |
| `OPEN_CALCULATOR` | `LOW` | No | Launches native Calculator (`calc.exe`) |
| `OPEN_NOTEPAD` | `LOW` | No | Launches native Notepad (`notepad.exe`) |
| `OPEN_FILE_EXPLORER` | `LOW` | No | Launches File Explorer (`explorer.exe`) |
| `OPEN_SETTINGS` | `LOW` | No | Opens Windows Settings (`explorer.exe ms-settings:`) |
| `OPEN_EMAIL` | `LOW` | No | Opens webmail in browser |
| `LOCK_SCREEN` | `LOW` | No | Locks workstation screen (`LockWorkStation`) |
| `SEND_EMAIL` | `HIGH` | **Yes** | Prepares outbound dispatch (requires secondary email token) |
| `SEND_WHATSAPP` | `HIGH` | **Yes** | Prepares message dispatch (requires secondary approval) |
| `DELETE_FILE` | `CRITICAL` | **Yes** | Destructive operation (requires step-up authorization) |
| `SHUTDOWN` | `CRITICAL` | **Yes** | Destructive OS operation (requires step-up authorization) |

---

## 3. Atomic Claiming & Lifecycle States
To prevent race conditions across multiple active laptops:
- Commands are assigned status `APPROVED`.
- When an agent polls `GET /api/v1/agent/pending`, it must call `POST /api/v1/agent/claim` before executing.
- The backend transitions the command to `CLAIMED` in an atomic transaction with a 5-minute execution lease.
- Once executed, the agent reports `POST /api/v1/agent/ack`, transitioning status to `EXECUTED`.
- Expired commands transition automatically to `EXPIRED` and cannot be claimed.
