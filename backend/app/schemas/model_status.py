"""
Model / pipeline status schemas — consumed by the frontend Pipeline Status panel.
"""
from typing import Literal
from pydantic import BaseModel

ServiceStatus = Literal["ONLINE", "UNAVAILABLE", "HEURISTIC", "HEURISTIC_ONLY", "DEGRADED", "SIMULATION"]


class ServiceStatusItem(BaseModel):
    name: str
    key: str
    status: ServiceStatus
    version: str | None = None
    note: str | None = None


class ModelStatusResponse(BaseModel):
    phase: int
    services: list[ServiceStatusItem]
