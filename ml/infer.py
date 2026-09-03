"""End-to-end sonar anomaly detection: preprocess → YOLO → confidence filter → geotag."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from geotag import box_dimensions_m, pixel_to_latlon
from preprocess import box_contrast_score, prepare_for_detector, shadow_penalty, to_gray

ROOT = Path(__file__).resolve().parent
WEIGHTS = ROOT / "weights" / "sonar-debris-yolo11n.pt"
FALLBACK = Path("yolo11n.pt")

CLASS_NAMES = [
    "ghost_net",
    "debris",
    "shipwreck",
    "aircraft",
    "propeller",
    "tire",
    "cylinder",
    "diver",
]

HAZARD_RANK = {
    "ghost_net": 95,
    "shipwreck": 88,
    "aircraft": 86,
    "propeller": 70,
    "tire": 62,
    "cylinder": 68,
    "debris": 55,
    "diver": 90,
}

_model: YOLO | None = None
_model_path: str | None = None


def resolve_weights() -> Path:
    if WEIGHTS.exists():
        return WEIGHTS
    runs = list((ROOT / "runs").glob("**/weights/best.pt"))
    if runs:
        return sorted(runs, key=lambda p: p.stat().st_mtime)[-1]
    return FALLBACK


def get_model() -> YOLO:
    global _model, _model_path
    path = str(resolve_weights())
    if _model is None or _model_path != path:
        _model = YOLO(path)
        _model_path = path
    return _model


def fused_confidence(yolo_conf: float, gray: np.ndarray, xyxy: list[float]) -> tuple[float, dict[str, float]]:
    contrast = box_contrast_score(gray, xyxy)
    shadow = shadow_penalty(gray, xyxy)
    fused = float(np.clip(yolo_conf * (0.55 + 0.45 * contrast) * shadow, 0.0, 0.99))
    return fused, {"yolo": round(yolo_conf, 4), "contrast": round(contrast, 4), "shadow": round(shadow, 4)}


def detect_image(
    image: np.ndarray,
    meta: dict[str, Any] | None = None,
    conf_threshold: float = 0.22,
    iou: float = 0.45,
) -> dict[str, Any]:
    t0 = time.time()
    meta = meta or {}
    prepared = prepare_for_detector(image)
    gray = to_gray(image)
    h, w = gray.shape[:2]
    model = get_model()
    results = model.predict(prepared, conf=0.12, iou=iou, verbose=False, imgsz=320, device="cpu")
    detections = []
    for r in results:
        if r.boxes is None:
            continue
        for box in r.boxes:
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            cls_id = int(box.cls[0])
            name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else f"class_{cls_id}"
            yolo_conf = float(box.conf[0])
            fused, parts = fused_confidence(yolo_conf, gray, xyxy)
            if fused < conf_threshold:
                continue
            cx = (xyxy[0] + xyxy[2]) / 2
            cy = (xyxy[1] + xyxy[3]) / 2
            lat, lon = pixel_to_latlon(cx, cy, w, h, meta)
            dims = box_dimensions_m(xyxy, meta)
            detections.append(
                {
                    "id": f"ANM-{uuid.uuid4().hex[:8]}",
                    "class": name,
                    "hazard_score": HAZARD_RANK.get(name, 50),
                    "confidence": round(fused * 100, 1),
                    "confidence_parts": parts,
                    "bbox_xyxy": [round(v, 1) for v in xyxy],
                    "center_px": [round(cx, 1), round(cy, 1)],
                    "latitude": None if lat is None else round(lat, 7),
                    "longitude": None if lon is None else round(lon, 7),
                    "dimensions": dims,
                }
            )

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    elapsed = round((time.time() - t0) * 1000)
    return {
        "model": Path(_model_path or "").name,
        "image_size": {"width": w, "height": h},
        "inference_ms": elapsed,
        "threshold": conf_threshold,
        "detections": detections,
        "count": len(detections),
        "metadata": meta,
        "survey_id": meta.get("survey") or "unspecified",
    }


def annotate(image: np.ndarray, report: dict[str, Any]) -> np.ndarray:
    vis = image.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    # BGR, matched to dashboard CLASS_COLOR hex
    palette = {
        "ghost_net": (248, 189, 56),
        "debris": (212, 234, 94),
        "shipwreck": (113, 113, 248),
        "aircraft": (253, 181, 196),
        "propeller": (36, 191, 251),
        "tire": (153, 211, 52),
        "cylinder": (21, 204, 250),
        "diver": (133, 113, 251),
    }
    for det in report["detections"]:
        x1, y1, x2, y2 = [int(v) for v in det["bbox_xyxy"]]
        color = palette.get(det["class"], (0, 220, 255))
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"{det['class']} {det['confidence']:.0f}%"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(vis, (x1, max(0, y1 - th - 8)), (x1 + tw + 6, y1), color, -1)
        cv2.putText(
            vis,
            label,
            (x1 + 3, y1 - 5),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (10, 12, 16),
            1,
            cv2.LINE_AA,
        )
    return vis


def report_to_csv(report: dict[str, Any]) -> str:
    headers = [
        "id",
        "class",
        "confidence_pct",
        "hazard_score",
        "latitude",
        "longitude",
        "width_m",
        "length_m",
        "x1",
        "y1",
        "x2",
        "y2",
    ]
    rows = [",".join(headers)]
    for d in report["detections"]:
        x1, y1, x2, y2 = d["bbox_xyxy"]
        rows.append(
            ",".join(
                str(v)
                for v in [
                    d["id"],
                    d["class"],
                    d["confidence"],
                    d["hazard_score"],
                    d.get("latitude") or "",
                    d.get("longitude") or "",
                    d["dimensions"]["width_m"],
                    d["dimensions"]["length_m"],
                    x1,
                    y1,
                    x2,
                    y2,
                ]
            )
        )
    return "\n".join(rows) + "\n"


def dump_json(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2)
