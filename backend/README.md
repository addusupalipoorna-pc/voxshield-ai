# VoxShield AI — Backend

FastAPI + SQLAlchemy backend for the VoxShield AI cybersecurity platform.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate      # Linux/macOS

pip install -r requirements.txt

cp .env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY at minimum

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --port 8000
```

## Endpoints (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + DB connectivity |
| GET | `/api/v1/model-status` | Pipeline service status |

## Phase

Currently Phase 2 — skeleton only. Auth, voice pipeline, and agent are in later phases.
