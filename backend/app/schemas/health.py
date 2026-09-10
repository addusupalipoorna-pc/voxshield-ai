"""
Health check schemas.
"""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str          # "ok" | "degraded" | "error"
    version: str
    environment: str
    db: str              # "connected" | "unavailable"
    uptime_seconds: float
