# VoxShield AI — Security Architecture & Hardening

## Overview
VoxShield AI operates as an enterprise defensive security solution. The codebase is engineered under zero-trust principles: the frontend is treated solely as an untrusted client interface; all validation, authorization, rate limiting, and execution boundaries reside strictly within the backend and agent layers.

---

## 1. Authentication & Session Management
- **Token Strategy**: Short-lived JSON Web Tokens (HS256) paired with cryptographically hashed refresh tokens stored in the database.
- **Unified Key Convention**: Frontend client stores only `voxshield_access_token` and `voxshield_user` in local storage.
- **Server-Side Validation**: Every protected endpoint authenticates the JWT subject, verifies user existence in the database, checks `is_active=True`, and enforces role authorization.
- **Credential Storage**: Passwords are never stored in plaintext. They are hashed using `bcrypt` with adaptive cost salt rounds.

---

## 2. Role-Based Access Control (RBAC)
Canonical user roles are enforced across all layers via Python enums and TypeScript types:
- `USER`: Regular authenticated operator. Can enroll voice, analyze microphone input, trigger commands, and manage personal devices/privacy.
- `SECURITY_ANALYST`: Security responder. Can view and triage incidents, inspect forensic acoustic metrics, review security timeline analytics, and inspect audit logs.
- `ADMIN`: System administrator. Full platform authority, including user management, device revocation, system configuration, and model service monitoring.

Any unauthorized request receives an immediate `HTTP 403 Forbidden` response from the backend.

---

## 3. Command Security & Anti-Command Injection
- **Explicit Allowlist**: The laptop agent and backend only recognize intents explicitly present in `ALLOWED_COMMANDS`:
  - Safe: `OPEN_WHATSAPP`, `OPEN_CHROME`, `OPEN_YOUTUBE`, `OPEN_GOOGLE_MAPS`, `OPEN_CALCULATOR`, `OPEN_NOTEPAD`, `OPEN_FILE_EXPLORER`, `OPEN_SETTINGS`, `OPEN_EMAIL`, `LOCK_SCREEN`.
  - High Risk: `SEND_EMAIL`, `SEND_WHATSAPP`, `DELETE_FILE`, `SHUTDOWN`.
- **Zero Shell Evaluation**: The agent executes applications using `subprocess.Popen(..., shell=False)`. User transcripts or parameters are never passed to shell interpreters (`cmd.exe`, `powershell`, or `bash`).
- **Transactional Atomic Claiming**: Commands transition through `PENDING -> CLAIMED -> EXECUTED`. Agents atomically claim commands via `/api/v1/agent/claim` before execution, preventing double execution or race conditions.
- **Command Expiration**: Approved high-risk commands automatically expire after 15 minutes. Claimed commands expire if not acknowledged within 5 minutes.

---

## 4. Step-Up Verification (Email & OTP)
For sensitive or high-risk voice commands:
- A cryptographically random token is generated via `secrets.token_urlsafe(32)`.
- The token is stored **hashed (SHA-256)** in `command_approvals` with an explicit expiration timestamp.
- Raw tokens are never logged or exposed in standard API queries.
- Approval links are single-use: upon approval or rejection, `is_used` is set to `True`, and subsequent reuse attempts fail.

---

## 5. Defense-in-Depth HTTP Hardening
- **Security Headers Middleware**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production)
  - `Content-Security-Policy: default-src 'self' ...`
- **In-Memory Sliding Window Rate Limiting**:
  - Login/Register: 10 requests per minute per IP.
  - Analysis & Commands: 30 requests per minute per IP.
  - Exceeding quota returns `HTTP 429 Too Many Requests`.
- **Production Startup Checks**:
  - If `APP_ENV=production`, the backend refuses to start if `SECRET_KEY` or `APPROVAL_SECRET` match default insecure placeholders.

---

## 6. Biometric Data Privacy (GDPR Compliance)
- **Data Minimization**: Raw recorded audio is never permanently stored on backend disks. Audio received for verification or enrollment is processed in memory/temporary buffer and immediately deleted upon feature extraction.
- **Feature Protection**: Only mathematical acoustic vectors (MFCCs / embedding arrays) are retained in the database.
- **Right to Erasure**: Users can permanently delete their voice profile and mathematical representations via `DELETE /api/v1/voice/profile`.
- **Data Portability**: Users can export all stored personal telemetry and logs via `GET /api/v1/privacy/export`.
