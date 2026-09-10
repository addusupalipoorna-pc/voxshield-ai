# VoxShield AI — API Specification

Base Path: `/api/v1`

All authenticated endpoints require `Authorization: Bearer <access_token>` in request headers.

---

## 1. Authentication Endpoints

### `POST /api/v1/auth/register`
Register a new operator account with explicit biometric consent.
- **Request**:
  ```json
  {
    "name": "Poorna Analyst",
    "email": "poorna@voxshield.ai",
    "phone": "+1-555-0199",
    "password": "StrongPassword123!",
    "consent": true
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
      "id": "uuid",
      "name": "Poorna Analyst",
      "email": "poorna@voxshield.ai",
      "role": "USER",
      "is_active": true,
      "is_verified": false
    }
  }
  ```

### `POST /api/v1/auth/login`
Authenticate existing user and retrieve session token.
- **Request**:
  ```json
  { "email": "admin@voxshield.ai", "password": "AdminSecurePassword!" }
  ```

### `GET /api/v1/auth/me`
Retrieve currently authenticated user profile and canonical role.

### `POST /api/v1/auth/logout`
Record audit log and invalidate client session.

### `POST /api/v1/auth/forgot-password`
Issue single-use expiring password reset token.

### `POST /api/v1/auth/reset-password`
Consume valid token and update password.

### `POST /api/v1/auth/verify-email`
Verify email ownership via verification token.

---

## 2. Voice & Biometric Analysis Endpoints

### `POST /api/v1/voice/enroll` (Multipart)
Upload 3 clean speech samples to extract reference biometric feature vectors.
- **Form Data**:
  - `audio`: audio/wav blob
  - `sample_index`: integer (1, 2, or 3)

### `GET /api/v1/voice/profile`
Get active speaker profile status and enrollment metrics.

### `DELETE /api/v1/voice/profile`
Permanently purge mathematical voice profile from the database.

### `POST /api/v1/voice/analyze` (Multipart)
Submit live audio recording and transcript for full multi-factor security evaluation.
- **Response**:
  ```json
  {
    "analysis_id": "uuid",
    "timestamp": "2026-09-08T18:00:00Z",
    "audio_quality": { "rms": 0.082, "snr_db": 24.5 },
    "speaker_verification": { "match": true, "similarity": 0.88, "mode": "HEURISTIC" },
    "deepfake_detection": { "status": "UNAVAILABLE", "is_heuristic": false },
    "replay_detection": { "label": "GENUINE", "confidence": 0.91, "mode": "HEURISTIC" },
    "risk": { "score": 18.5, "level": "LOW", "decision": "ALLOW" }
  }
  ```

---

## 3. Command & Approval Endpoints

### `POST /api/v1/commands/interpret`
Translate raw speech transcript into structured intent.
- **Request**: `{ "transcript": "Open WhatsApp please" }`
- **Response**:
  ```json
  {
    "command_id": "uuid",
    "intent": "OPEN_WHATSAPP",
    "risk": "LOW",
    "requires_approval": false,
    "status": "APPROVED"
  }
  ```

### `POST /api/v1/commands/request-approval`
Request step-up verification for high-risk commands (`SEND_EMAIL`, `DELETE_FILE`).
- **Response**:
  ```json
  {
    "approval_id": "uuid",
    "command_id": "uuid",
    "email_sent": false,
    "demo_mode": true,
    "approve_url": "http://localhost:5173/api/v1/commands/approve/<token>",
    "reject_url": "http://localhost:5173/api/v1/commands/reject/<token>"
  }
  ```

---

## 4. Trusted Devices & Laptop Agent Endpoints

### `POST /api/v1/devices/register`
Register new workstation and receive secret agent device token.

### `GET /api/v1/devices`
List registered trusted devices for the authenticated user.

### `POST /api/v1/devices/{id}/revoke`
Revoke execution authorization for a specific device.

### `GET /api/v1/agent/pending?device_id={device_id}`
Poll authorized pending commands bound to this laptop device.

### `POST /api/v1/agent/claim`
Atomically claim an approved command.
- **Request**: `{ "command_id": "uuid" }`
- **Response**: `{ "command_id": "uuid", "status": "CLAIMED" }`

### `POST /api/v1/agent/ack`
Report execution success or failure from the laptop OS.
- **Request**:
  ```json
  {
    "command_id": "uuid",
    "device_id": "laptop-1",
    "success": true,
    "message": "WhatsApp Desktop opened"
  }
  ```

---

## 5. Security Center, Incidents & System Endpoints

### `GET /api/v1/incidents`
Retrieve security incidents (accessible to `SECURITY_ANALYST` and `ADMIN`).

### `PATCH /api/v1/incidents/{id}`
Update incident investigation status (`NEW`, `INVESTIGATING`, `RESOLVED`, `FALSE_POSITIVE`).

### `GET /api/v1/audit-logs`
Query immutable audit logs.

### `GET /api/v1/admin/users`
List real registered database accounts (`ADMIN` only).

### `GET /health`
System liveness and PostgreSQL database connection probe.

### `GET /api/v1/model-status`
Truthful pipeline readiness status across all AI and heuristic services.
