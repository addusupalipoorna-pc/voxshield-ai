"""
VoxShield AI — FastAPI Application Factory
Phase 3: Full pipeline — voice analysis, commands, incidents, analytics, agent, devices, privacy.
"""
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
import logging
import time

from fastapi import FastAPI, Request, Response, status, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.db.init_db import init_db
from app.api.v1.health import router as health_router
from app.api.v1.auth import router as auth_router, send_dual_otp, verify_dual_otp, configure_credentials
from app.api.v1.voice import router as voice_router
from app.api.v1.commands import router as commands_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.agent_api import router as agent_router
from app.api.v1.devices import router as devices_router
from app.api.v1.privacy import router as privacy_router
from app.api.v1.audit_logs import router as audit_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("voxshield")


# ── Middleware: Security Headers ──────────────────────────────────────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "microphone=(self)"
        return response


# ── Middleware: Rate Limiting (In-Memory) ──────────────────────────────────────

RATE_LIMIT_BUCKET = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS_PER_WINDOW = 60  # general
MAX_AUTH_REQUESTS_PER_WINDOW = 15  # auth/registration/login

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = time.time()

        # Never rate-limit local agent polling or background status checks
        if path.startswith("/api/v1/agent/") or path == "/health" or path == "/api/v1/health":
            return await call_next(request)

        limit = MAX_AUTH_REQUESTS_PER_WINDOW if "/auth/" in path or "/devices/register" in path else MAX_REQUESTS_PER_WINDOW
        key = f"{client_ip}:{path}"

        # Clean old hits
        RATE_LIMIT_BUCKET[key] = [t for t in RATE_LIMIT_BUCKET[key] if now - t < RATE_LIMIT_WINDOW]

        if len(RATE_LIMIT_BUCKET[key]) >= limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Please wait a moment before trying again."},
            )

        RATE_LIMIT_BUCKET[key].append(now)
        return await call_next(request)


# ── Application Lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    settings = get_settings()

    # 1. Critical Production Security Check
    if not settings.is_development:
        insecure_keys = ("INSECURE-CHANGE-ME", "INSECURE-APPROVAL-SECRET", "INSECURE-AGENT-TOKEN", "change-me")
        if any(ik in settings.secret_key or ik in settings.approval_secret for ik in insecure_keys):
            raise RuntimeError(
                "CRITICAL SECURITY FAILURE: Application cannot start in production with default insecure secrets. "
                "Ensure SECRET_KEY and APPROVAL_SECRET are securely set."
            )

    logger.info(
        "VoxShield AI backend starting — env=%s, db=%s",
        settings.app_env,
        "SQLite" if settings.using_sqlite else "PostgreSQL",
    )

    try:
        init_db()
        logger.info("Database tables initialized.")
    except Exception as exc:
        logger.warning("Could not initialise DB tables: %s", exc)

    yield

    logger.info("VoxShield AI backend shutting down.")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="VoxShield AI",
        description=(
            "Voice security platform backend — real-time voice analysis, "
            "speaker verification, deepfake detection, and secure command execution.\n\n"
            "**SIH26104 — Smart India Hackathon 2024**"
        ),
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── Middlewares ──────────────────────────────────────────────────────────
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)

    # ── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins if settings.cors_origins else ["*"],
        allow_origin_regex=r"https://.*|http://localhost:.*|http://127\.0\.0\.1:.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ──────────────────────────────────────────────────────────────
    app.include_router(health_router)     # GET /health, GET /api/v1/model-status
    app.include_router(auth_router)       # /api/v1/auth/*
    app.include_router(voice_router)      # /api/v1/voice/*
    app.include_router(commands_router)   # /api/v1/commands/*
    app.include_router(incidents_router)  # /api/v1/incidents/*
    app.include_router(analytics_router)  # /api/v1/analytics/*
    app.include_router(agent_router)      # /api/v1/agent/*
    app.include_router(devices_router)    # /api/v1/devices/*
    app.include_router(privacy_router)    # /api/v1/privacy/*
    app.include_router(audit_router)      # /api/v1/audit-logs, /api/v1/admin/users

    # ── Direct /api/* Dual OTP Aliases ───────────────────────────────────────
    api_alias_router = APIRouter(prefix="/api", tags=["Dual OTP Broadcast"])
    api_alias_router.add_api_route("/send-dual-otp", send_dual_otp, methods=["POST"])
    api_alias_router.add_api_route("/verify-otp", verify_dual_otp, methods=["POST"])
    api_alias_router.add_api_route("/configure-credentials", configure_credentials, methods=["POST"])
    app.include_router(api_alias_router)

    # ── Serve Built Frontend SPA (Unified Single-Host Deployment) ──────────────
    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../dist"))
    if not os.path.isdir(frontend_dist):
        frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../dist"))

    if os.path.isdir(frontend_dist):
        from fastapi.staticfiles import StaticFiles
        from fastapi.responses import FileResponse

        assets_dir = os.path.join(frontend_dist, "assets")
        if os.path.isdir(assets_dir):
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("redoc") or full_path.startswith("openapi.json"):
                raise HTTPException(status_code=404, detail="Not Found")
            file_path = os.path.join(frontend_dist, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(frontend_dist, "index.html"))

    return app


app = create_app()
