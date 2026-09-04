from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    source_type: Literal["tcp", "directory"] = "directory"
    host: str | None = None
    port: int | None = None
    path: str | None = None
    survey_name: str | None = None


class ReviewRequest(BaseModel):
    decision: Literal["approve", "reject", "uncertain"]
    note: str = ""


class RuntimeSettingsIn(BaseModel):
    conf_threshold: float = Field(0.22, ge=0.01, le=0.95)
    nms_threshold: float = Field(0.45, ge=0.1, le=0.9)
    lee_size: int = Field(5, ge=3, le=15)
    clahe_clip: float = Field(2.4, ge=0.5, le=8.0)
    use_lee: bool = True
    use_clahe: bool = True
    inpaint_dropouts: bool = True
    shadow_filter: bool = True
    model_path: str | None = None
    map_tile: Literal["osm"] = "osm"


DEFAULT_SETTINGS = RuntimeSettingsIn().model_dump()


class DetectionOut(BaseModel):
    id: str
    survey_id: str
    frame_id: str
    class_name: str
    raw_confidence: float
    final_confidence: float
    validation_status: str
    risk_level: str
    x: float
    y: float
    width: float
    height: float
    width_m: float | None
    length_m: float | None
    latitude: float | None
    longitude: float | None
    timestamp: datetime | None
    depth: float | None
    heading: float | None
    ping_number: int | None
    overlay_url: str | None = None
    image_url: str | None = None
    gps_label: str
    validation_reason: str | None = None
    operator_decision: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


def gps_label(lat: float | None, lon: float | None) -> str:
    if lat is None or lon is None:
        return "GPS unavailable"
    return f"{lat:.6f}, {lon:.6f}"
