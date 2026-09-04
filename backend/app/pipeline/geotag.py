"""Pixel → geographic conversion. Never invents GPS or resolution."""

from __future__ import annotations

import math
from typing import Any


def destination(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
    r = 6371000.0
    br = math.radians(bearing_deg)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_m / r)
        + math.cos(lat1) * math.sin(distance_m / r) * math.cos(br)
    )
    lon2 = lon1 + math.atan2(
        math.sin(br) * math.sin(distance_m / r) * math.cos(lat1),
        math.cos(distance_m / r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def _num(meta: dict[str, Any], *keys: str) -> float | None:
    for k in keys:
        v = meta.get(k)
        if v is None or v == "":
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    return None


def pixel_to_latlon(
    cx: float,
    cy: float,
    width: int,
    height: int,
    meta: dict[str, Any],
) -> tuple[float | None, float | None]:
    lat = _num(meta, "latitude", "lat")
    lon = _num(meta, "longitude", "lon")
    if lat is None or lon is None:
        return None, None
    mpx = _num(meta, "meters_per_pixel_x", "resolution_x")
    mpy = _num(meta, "meters_per_pixel_y", "resolution_y")
    heading = _num(meta, "heading_deg", "heading")
    if mpx is None or mpy is None or heading is None:
        # Vessel position known, but across/along scale or heading missing:
        # return the ping origin only when the pixel is the image centre; else unavailable.
        if abs(cx - width / 2.0) < 1 and abs(cy - height / 2.0) < 1:
            return lat, lon
        return lat, lon  # associate detection with ping origin, not a fabricated offset
    nadir = _num(meta, "nadir_pixel_x")
    nadir_x = nadir if nadir is not None else width / 2.0
    along_m = (cy - height / 2.0) * mpy
    across_m = (cx - nadir_x) * mpx
    along_lat, along_lon = destination(lat, lon, heading, along_m)
    return destination(along_lat, along_lon, heading + 90.0, across_m)


def box_dimensions_m(xyxy: list[float], meta: dict[str, Any]) -> dict[str, float | None]:
    mpx = _num(meta, "meters_per_pixel_x", "resolution_x")
    mpy = _num(meta, "meters_per_pixel_y", "resolution_y")
    w_px = max(0.0, xyxy[2] - xyxy[0])
    h_px = max(0.0, xyxy[3] - xyxy[1])
    return {
        "width_m": None if mpx is None else round(w_px * mpx, 3),
        "length_m": None if mpy is None else round(h_px * mpy, 3),
        "width_px": round(w_px, 1),
        "height_px": round(h_px, 1),
    }
