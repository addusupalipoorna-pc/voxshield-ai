# VoxShield AI — System Architecture

## Overview
**VoxShield AI** is an enterprise AI-powered voice authenticity verification and secure command execution platform designed for **SIH Problem Statement SIH26104** (*AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks*).

Unlike conventional systems that merely classify audio as real or synthetic, VoxShield enforces end-to-end security:
1. Real-time microphone audio capture and acoustic feature extraction.
2. Multi-tier biometric and anti-spoofing verification.
3. Natural-language command interpretation against a strict allowlist.
4. Deterministic multi-factor risk assessment.
5. Secondary step-up verification (cryptographic email token / OTP) for sensitive actions.
6. Execution delegation strictly to registered, authenticated trusted laptop devices.

---

## Architectural Topology

```text
                 ┌──────────────────────────────────────┐
                 │       VoxShield Web Frontend         │
                 │   React 19 + TypeScript + Vite       │
                 │   Web Audio DSP + Three.js 3D Shield │
                 └──────────────────┬───────────────────┘
                                    │ HTTPS / WSS
                                    ▼
                 ┌──────────────────────────────────────┐
                 │        FastAPI Security Backend      │
                 │     JWT Auth, RBAC, Rate Limiter     │
                 │     Security Headers & Audit Engine  │
                 └───────┬──────────┬──────────┬────────┘
                         │          │          │
         ┌───────────────┘          │          └───────────────┐
         ▼                          ▼                          ▼
┌─────────────────┐       ┌────────────────────┐     ┌─────────────────┐
│ PostgreSQL 16   │       │ AI Services Layer  │     │ Deterministic   │
│ Primary Relational      │  (Truthful Status) │     │ Risk Engine     │
│ DB with Alembic │       │                    │     │                 │
└─────────────────┘       │ 1. Speaker Match   │     │ Multi-factor:   │
                          │    (ECAPA/MFCC)    │     │ Authenticity,   │
                          │ 2. Deepfake Anti-  │     │ Verification,   │
                          │    Spoof (AASIST)  │     │ Replay, Risk,   │
                          │ 3. Replay Detector │     │ Device Trust    │
                          │ 4. STT (Whisper)   │     └────────┬────────┘
                          └────────────────────┘              │
                                                              ▼
                                                   ┌─────────────────────┐
                                                   │ Security Decision   │
                                                   │ ALLOW / VERIFY /    │
                                                   │ BLOCK               │
                                                   └──────────┬──────────┘
                                                              │
                                       ┌──────────────────────┼──────────────────────┐
                                       ▼                      ▼                      ▼
                                   [ ALLOW ]              [ VERIFY ]             [ BLOCK ]
                                       │                      │                      │
                                       │              Step-Up Approval          Incident Logged
                                       │              (Email Token/OTP)         Audit Recorded
                                       │                      │                 Notification Sent
                                       └──────────────┬───────┘
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │  Device-Bound Command Queue │
                                       │  (Transactional Claiming)   │
                                       └──────────────┬──────────────┘
                                                      │ Bearer / X-Device-Id
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │  VoxShield Laptop Agent     │
                                       │  Windows Python Daemon      │
                                       │  Strict OS Allowlist Only   │
                                       └──────────────┬──────────────┘
                                                      │ Subprocess (No Shell)
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │ Local OS Application Target │
                                       │ (WhatsApp, Browser, Calc)   │
                                       └─────────────────────────────┘
```

---

## Component Separation & Boundaries

### 1. Web Frontend (`src/`)
- **Technology**: React 19, TypeScript, Vite, TailwindCSS, Framer Motion, Three.js.
- **Audio DSP**: Browser-native `AudioContext` and `AnalyserNode` extracting live RMS, Zero-Crossing Rate, Spectral Centroid, Rolloff, and Flatness without fake animations.
- **State & Auth**: `AuthContext` utilizing a single token convention (`voxshield_access_token`, `voxshield_user`).

### 2. Backend API (`backend/app/`)
- **Technology**: FastAPI, SQLAlchemy 2.0, Pydantic v2, Alembic.
- **Security Boundary**: Server-side role validation (`UserRole.ADMIN`, `UserRole.SECURITY_ANALYST`, `UserRole.USER`), IP-based rate limiting, strict security headers, and immutable audit logs.
- **Primary Database**: PostgreSQL 16 (configured via `docker-compose.yml`), with SQLite supported as local development fallback.

### 3. AI & Analysis Layer (`backend/app/services/`)
- **Truthful Abstractions**: All detectors inherit from base services (`SpeakerVerificationService`, `DeepfakeDetectionService`, `ReplayDetectionService`, `TranscriptionService`).
- **Readiness Modes**: Explicitly reports `ONLINE`, `HEURISTIC`, `UNAVAILABLE`, or `SIMULATION`. Never fabricates 99.8% precision for prototype heuristic pipelines.

### 4. Laptop Agent (`agent/`)
- **Technology**: Standalone Python daemon.
- **Security Invariant**: Executes commands strictly from `ALLOWED_COMMANDS`. Never evaluates arbitrary user input in shell (`shell=False` everywhere).
- **Device Credentialing**: Authenticates using unique per-device bearer credentials and claims commands atomically before execution.
