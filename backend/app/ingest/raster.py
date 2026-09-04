from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from app.ingest.base import SonarFrame


def _maybe_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def load_sidecar_metadata(image_path: Path) -> dict[str, Any]:
    for cand in (
        image_path.with_suffix(".json"),
        image_path.with_suffix(".meta.json"),
        Path(str(image_path) + ".json"),
        image_path.parent / "metadata.json",
    ):
        if cand.exists():
            try:
                data = json.loads(cand.read_text())
                return data if isinstance(data, dict) else {}
            except json.JSONDecodeError:
                return {}
    csv = image_path.with_suffix(".csv")
    if csv.exists():
        lines = csv.read_text().strip().splitlines()
        if len(lines) >= 2:
            keys = [k.strip() for k in lines[0].split(",")]
            vals = [v.strip() for v in lines[1].split(",")]
            return dict(zip(keys, vals, strict=False))
    return {}


def decode_image_bytes(raw: bytes) -> np.ndarray:
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode raster sonar image")
    return img


class RasterSonarReader:
    """PNG / JPEG / TIFF waterfall or FLS raster plus optional sidecar JSON/CSV metadata."""

    def __init__(self, path: Path, extra_meta: dict[str, Any] | None = None) -> None:
        self.path = Path(path)
        self.extra_meta = extra_meta or {}
        self._ok = self.path.exists()

    def connect(self) -> None:
        if not self.path.exists():
            raise FileNotFoundError(self.path)
        self._ok = True

    def disconnect(self) -> None:
        self._ok = False

    def is_connected(self) -> bool:
        return self._ok and self.path.exists()

    def describe(self) -> str:
        return f"raster:{self.path.name}"

    def read_frames(self) -> list[SonarFrame]:
        img = cv2.imread(str(self.path), cv2.IMREAD_COLOR)
        if img is None:
            raw = self.path.read_bytes()
            img = decode_image_bytes(raw)
        meta = {**load_sidecar_metadata(self.path), **self.extra_meta}
        ts = meta.get("timestamp")
        stamp = None
        if ts:
            try:
                stamp = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                stamp = None
        lat = _maybe_float(meta.get("latitude") if meta.get("latitude") is not None else meta.get("lat"))
        lon = _maybe_float(meta.get("longitude") if meta.get("longitude") is not None else meta.get("lon"))
        heading = _maybe_float(meta.get("heading_deg") if meta.get("heading_deg") is not None else meta.get("heading"))
        return [
            SonarFrame(
                frame_id="0",
                survey_id="",
                image=img,
                timestamp=stamp,
                latitude=lat,
                longitude=lon,
                heading=heading,
                depth=_maybe_float(meta.get("depth")),
                altitude=_maybe_float(meta.get("altitude")),
                range_m=_maybe_float(meta.get("range") or meta.get("range_m")),
                ping_number=int(meta["ping_number"]) if meta.get("ping_number") not in (None, "") else None,
                resolution=(
                    _maybe_float(meta.get("meters_per_pixel_x") or meta.get("resolution_x")),
                    _maybe_float(meta.get("meters_per_pixel_y") or meta.get("resolution_y")),
                ),
                channel=str(meta.get("channel")) if meta.get("channel") else "raster",
                metadata=meta,
            )
        ]
