# VoxShield AI — Database Schema & Migrations

## Primary Database Architecture
- **Production / Recommended**: PostgreSQL 16
  - Connection string: `postgresql+psycopg://voxshield:password@localhost:5432/voxshield`
  - Containerized deployment via root `docker-compose.yml`.
- **Local Dev Fallback**: SQLite
  - Connection string: `sqlite:///./voxshield_dev.db`
  - Automatically enabled when `DATABASE_URL` specifies SQLite.

---

## 1. Relational Entities

### `users`
Core user identity and role records.
- `id`: UUID (Primary Key)
- `name`: Full Name
- `email`: Unique email address
- `phone`: Contact phone number
- `hashed_password`: bcrypt hash
- `role`: Canonical enum (`ADMIN`, `SECURITY_ANALYST`, `USER`)
- `is_active`: Boolean active status
- `is_verified`: Email verification status
- `consent_given`: Explicit biometric consent flag
- `consent_at`: Timestamp of consent agreement
- `last_login_at`: Timestamp of latest authenticated session
- `created_at`, `updated_at`: Audit timestamps

### `trusted_devices`
Authorized workstation identities and agent credentials.
- `id`: UUID (Primary Key)
- `user_id`: Foreign Key (`users.id`)
- `name`: User-assigned machine label
- `device_fingerprint`: Unique hardware/client fingerprint
- `device_token_hash`: SHA-256 hash of device secret token
- `platform`: OS platform (`windows`, `darwin`, `linux`)
- `agent_version`: Installed agent version
- `status`: Device state (`ACTIVE`, `REVOKED`)
- `last_seen_at`: Heartbeat timestamp

### `voice_analyses` & `analysis_features`
Acoustic feature analysis results and biometric records.
- Stores duration, sample rate, audio hash, RMS, ZCR, spectral centroid, flatness, and extracted 13-MFCC vectors.

### `speaker_profiles` & `voice_samples`
Enrolled mathematical speaker representation.
- Stores averaged reference MFCC array and sample count metadata. Raw audio files are discarded.

### `voice_commands` & `command_approvals`
Command state machine and step-up verification tokens.
- `voice_commands`: Stores `intent`, `risk`, `status` (`PENDING`, `APPROVAL_REQUIRED`, `APPROVED`, `CLAIMED`, `EXECUTING`, `EXECUTED`, `BLOCKED`, `REJECTED`, `EXPIRED`, `FAILED`), and foreign key to `trusted_devices`.
- `command_approvals`: Stores single-use `token_hash`, `expires_at`, `is_used`, and decision record.

### `incidents`
Security events generated automatically from voice cloning or blocked high-risk attempts.
- Tracks `attack_type`, `risk_level`, `status` (`NEW`, `INVESTIGATING`, `RESOLVED`, `FALSE_POSITIVE`), and analyst notes.

### `audit_logs`
Immutable audit trail of authentication, voice enrollment, device registration, and execution events.

---

## 2. Migrations with Alembic
Alembic manages schema evolution cleanly across environments.

Commands:
```bash
cd backend
# Check current migration head
alembic current

# Run migrations to latest version
alembic upgrade head

# Create a new migration revision
alembic revision --autogenerate -m "description"
```
