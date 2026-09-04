"""Convert pixel detections to geographic coordinates using SSS metadata."""

from __future__ import annotations

import io
import math
from typing import Any


def _exif_ratio(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        if hasattr(value, "numerator"):
            return float(value.numerator) / float(value.denominator or 1)
    return 0.0


def _dms_to_deg(values: Any, ref: str | None) -> float | None:
    if not values or len(values) < 3:
        return None
    deg = _exif_ratio(values[0]) + _exif_ratio(values[1]) / 60.0 + _exif_ratio(values[2]) / 3600.0
    if ref in {"S", "W"}:
        deg = -deg
    return deg


def read_exif_gps(image_bytes: bytes) -> tuple[float | None, float | None]:
    try:
        from PIL import Image
        from PIL.ExifTags import GPSTAGS, IFD
    except Exception:
        return None, None
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return None, None
        gps = exif.get_ifd(IFD.GPSInfo) if hasattr(IFD, "GPSInfo") else None
        if not gps:
            return None, None
        tagged = {GPSTAGS.get(k, k): v for k, v in gps.items()}
        lat = _dms_to_deg(tagged.get("GPSLatitude"), tagged.get("GPSLatitudeRef"))
        lon = _dms_to_deg(tagged.get("GPSLongitude"), tagged.get("GPSLongitudeRef"))
        if lat is None or lon is None:
            return None, None
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None, None
        return round(lat, 7), round(lon, 7)
    except Exception:
        return None, None


def merge_gps_metadata(meta: dict[str, Any], image_bytes: bytes | None = None) -> dict[str, Any]:
    out = dict(meta or {})
    if out.get("latitude") is not None and out.get("longitude") is not None:
        return out
    if not image_bytes:
        return out
    lat, lon = read_exif_gps(image_bytes)
    if lat is None or lon is None:
        return out
    out["latitude"] = lat
    out["longitude"] = lon
    out["gps_source"] = "exif"
    return out


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


def pixel_to_latlon(
    cx: float,
    cy: float,
    width: int,
    height: int,
    meta: dict[str, Any],
) -> tuple[float | None, float | None]:
    lat = meta.get("latitude")
    lon = meta.get("longitude")
    if lat is None or lon is None:
        return None, None
    mpx = float(meta.get("meters_per_pixel_x") or 0.1)
    mpy = float(meta.get("meters_per_pixel_y") or 0.1)
    heading = float(meta.get("heading_deg") or 0.0)
    nadir = meta.get("nadir_pixel_x")
    nadir_x = float(nadir) if nadir is not None else width / 2.0

    # Image y increases down-track; x increases starboard from nadir.
    along_m = (cy - height / 2.0) * mpy
    across_m = (cx - nadir_x) * mpx
    along_lat, along_lon = destination(float(lat), float(lon), heading, along_m)
    return destination(along_lat, along_lon, heading + 90.0, across_m)


def box_dimensions_m(xyxy: list[float], meta: dict[str, Any]) -> dict[str, float]:
    mpx = float(meta.get("meters_per_pixel_x") or 0.1)
    mpy = float(meta.get("meters_per_pixel_y") or 0.1)
    w_px = max(0.0, xyxy[2] - xyxy[0])
    h_px = max(0.0, xyxy[3] - xyxy[1])
    return {
        "width_m": round(w_px * mpx, 3),
        "length_m": round(h_px * mpy, 3),
        "width_px": round(w_px, 1),
        "height_px": round(h_px, 1),
    }
