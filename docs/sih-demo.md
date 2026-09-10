# VoxShield AI — SIH Demonstration Script

## SIH Problem Statement
**SIH26104 — AI-Powered Real-Time Detection and Prevention of Voice Cloning Impersonation Attacks**

This document provides an end-to-end walkthrough for evaluators and judges demonstrating the complete working system.

---

## Pre-Requisites
1. Backend running: `http://localhost:8000` (FastAPI + PostgreSQL or SQLite dev db).
2. Frontend running: `http://localhost:5173` (Vite dev server).
3. Laptop Agent running on Windows machine: `python agent/main.py`.

---

## Demonstration Scenarios

### Demo 1: User Registration & Biometric Consent
1. Open `http://localhost:5173`.
2. Click **Sign In / Register** in the top navigation.
3. Switch to **Register** tab.
4. Enter Full Name, Email, Phone, Password, and check the **Voice Processing Consent** box.
5. Submit. Account is created in PostgreSQL with `consent_given=True` and timestamp logged.

### Demo 2: Voice Enrollment (3 Samples)
1. Navigate to **Voice Enrollment** (`/voice-enrollment`).
2. Grant microphone permissions.
3. Record Sample 1, Sample 2, and Sample 3 using the live audio visualizer.
4. Notice real-time audio features calculated (RMS, Zero-Crossing Rate, Spectral Centroid).
5. The backend validates audio quality, extracts MFCC vectors, and stores the speaker profile.
6. The UI confirms: `✓ Voice profile registered`.

### Demo 3: Safe Voice Command Execution ("Open WhatsApp")
1. In a terminal, start the laptop agent:
   ```bash
   cd agent
   python main.py
   ```
2. In the web application, navigate to **Command Center** (`/command-center`).
3. Click the microphone and say: **"Open WhatsApp"**.
4. The system pipeline executes:
   - Live microphone capture & DSP feature extraction.
   - Acoustic speaker matching against enrolled profile (Status: MATCH).
   - Replay & anti-spoof check.
   - Command intent recognized: `OPEN_WHATSAPP` (Risk: LOW).
   - Security decision: **ALLOW**.
   - Command queued with status `APPROVED`.
5. The laptop agent detects the command via polling, calls `/agent/claim`, executes the allowlisted action, and acknowledges success.
6. WhatsApp Desktop (or WhatsApp Web) immediately opens on the laptop screen.

### Demo 4: Synthetic / Cloned Voice Impersonation Block
1. Navigate to **Attack Simulator** (`/attack-simulator`) or **Voice Analyzer** (`/voice-analyzer`).
2. Play or simulate a cloned voice attack scenario.
3. The multi-factor risk engine detects spectral anomalies and speaker mismatches.
4. Risk evaluates to **CRITICAL**.
5. Security decision: **BLOCK**.
6. The command is rejected; no execution call is sent to the laptop agent.
7. An incident is automatically registered in **Incidents** (`/incidents`) and an entry is written to the immutable audit trail.

### Demo 5: High-Risk Action Step-Up Verification ("Send Email")
1. In Command Center, say: **"Send an urgent email to Ravi"**.
2. Voice is verified, but intent is classified as `SEND_EMAIL` (Risk: **HIGH**).
3. Status transitions to `APPROVAL_REQUIRED`.
4. The system dispatches an approval request with a short-lived, SHA-256 hashed cryptographic token.
5. The user confirms approval via the confirmation screen.
6. Upon approval verification, status transitions to `APPROVED` and the agent executes the action.

### Demo 6: Security Center & Forensic Report
1. Open **Forensics** (`/forensics`) to inspect complete mathematical telemetry:
   - Spectral rolloff, centroid, loudness distribution.
   - Complete decision audit trail linking analysis ID, command ID, risk factors, and device ID.
2. Click **Generate PDF Report** to export an official forensic audit document.
3. Open **Privacy & Data Management** (`/privacy`) to demonstrate GDPR data export or profile erasure.
