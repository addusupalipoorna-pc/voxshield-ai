# VoxShield AI

> **Hear the Voice. Verify the Identity. Stop the Impersonation.**

**SIH Problem Statement SIH26104 — AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks**

VoxShield AI does not simply classify whether a voice sounds synthetic. It integrates live microphone acoustic DSP, prototype speaker verification, replay/anti-spoof detection, deterministic multi-factor risk assessment, cryptographic secondary verification, trusted device authorization, and strictly allowlisted operating system execution on Windows laptops.

---

## Architecture At A Glance

```text
Spoken Audio (Microphone)
       │
       ▼
[ Web Audio DSP ] ──► RMS, ZCR, Spectral Centroid, Rolloff, Flatness
       │
       ▼
[ FastAPI Backend ] ──► Speaker Match + Replay Check + Risk Engine
       │
       ├── LOW RISK & ALLOW ──────────────────────────┐
       │                                              │
       └── HIGH RISK (SEND_EMAIL, DELETE_FILE)        │
                 │                                    │
                 ▼                                    │
       [ Step-Up Verification ] (Token / OTP)         │
                 │                                    │
                 ▼ (Approved)                         │
                 └──────────────────┬─────────────────┘
                                    ▼
                      [ Device-Bound Command Queue ]
                                    │
                                    ▼ (Claim & Execute)
                      [ VoxShield Laptop Agent ]
                                    │
                                    ▼
                      [ Local Windows Action Target ]
                      (WhatsApp, Browser, Calculator)
```

---

## Implemented Features & Component Status

### Status Legend
- **IMPLEMENTED**: Production or genuine working functionality.
- **PROTOTYPE**: Working heuristic mathematical implementation.
- **MODEL UNAVAILABLE**: Real neural weights/keys not loaded; truthfully reported.
- **SIMULATION**: Demonstration scenarios for attack simulations.

| Component | Status | Implementation Details |
| :--- | :--- | :--- |
| **Microphone Capture** | **IMPLEMENTED** | Real `navigator.mediaDevices.getUserMedia()` + Web Audio API |
| **Live Waveform & Spectrum** | **IMPLEMENTED** | Real-time `AnalyserNode` frequency/time-domain visualizer |
| **3D Security Shield** | **IMPLEMENTED** | Three.js interactive visualizer responding to threat level |
| **Database & Migrations** | **IMPLEMENTED** | PostgreSQL 16 primary + SQLite fallback; Alembic migrations |
| **User Authentication** | **IMPLEMENTED** | JWT + refresh tokens, bcrypt hashing, single token storage |
| **Role-Based Access Control**| **IMPLEMENTED** | Canonical roles: `ADMIN`, `SECURITY_ANALYST`, `USER` |
| **Speaker Matching** | **PROTOTYPE** | 13-MFCC extraction with cosine similarity metric |
| **Replay Detection** | **PROTOTYPE** | Heuristic acoustic bandwidth & far-field attenuation |
| **Deepfake Detection** | **MODEL UNAVAILABLE**| AASIST/RawNet2 service abstraction (truthfully reported) |
| **Speech-to-Text** | **IMPLEMENTED** | Web Speech API fallback + OpenAI Whisper service |
| **Command Execution** | **IMPLEMENTED** | Strict `ALLOWED_COMMANDS` Windows subprocess allowlist |
| **Trusted Devices** | **IMPLEMENTED** | Device registration, token hashing, atomic claim flow |
| **Security Incidents** | **IMPLEMENTED** | Automatic incident creation upon threat detection |
| **Forensic Export** | **IMPLEMENTED** | Forensic audio metrics and PDF report generator |
| **Privacy & GDPR** | **IMPLEMENTED** | Mathematical profile erasure and full account JSON export |

---

## Quick Start Guide

### 1. Start the PostgreSQL Database (Recommended)
```bash
docker compose up -d
```

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Backend API interactive docs: `http://localhost:8000/docs`

### 3. Frontend Setup
```bash
# In the root directory:
npm install
npm run dev
```
Web application: `http://localhost:5173`

### 4. Laptop Agent Setup (Windows)
```bash
cd agent
python main.py
```
To run interactive device registration:
```bash
python main.py --register
```

---

## Running Automated Tests

Run the full pytest test suite (53 unit, integration, RBAC, and scenario tests):
```bash
cd backend
.venv\Scripts\pytest tests -v
```
Output:
```text
====================== 53 passed, 259 warnings in 55.80s ======================
```

Run frontend production build verification:
```bash
npm run build
```

---

## Documentation Suite

Detailed architectural guides are located in the `docs/` folder:
- [System Architecture](docs/architecture.md)
- [Security Architecture & Hardening](docs/security.md)
- [API Specification](docs/api.md)
- [Voice & Audio Analysis Pipeline](docs/voice-pipeline.md)
- [Command Execution & Allowlist](docs/command-execution.md)
- [Laptop Agent Reference](docs/agent.md)
- [Database Schema & Migrations](docs/database.md)
- [AI Models & Truth in Telemetry](docs/ai-models.md)
- [SIH Demonstration Script](docs/sih-demo.md)

---

## Known Limitations
1. **Speaker Verification**: The current default build uses 13-MFCC acoustic cosine distance matching. Deep neural embeddings (ECAPA-TDNN) require heavy model weights (`SPEAKER_MODEL_PATH`).
2. **Deepfake Detection**: Trained anti-spoof neural networks (AASIST/RawNet2) are reported as `UNAVAILABLE` unless pre-trained PyTorch weights are mounted.
3. **Execution Platform**: The laptop agent is optimized for Windows operating systems (the SIH target demonstration environment); macOS and Linux provide partial desktop/browser fallback equivalents.

---

## License
Proprietary — Developed for Smart India Hackathon (SIH 2026).
