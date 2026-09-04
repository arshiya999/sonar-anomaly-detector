"""YOLO detection / segmentation. Class names come from the loaded weights."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from app.config import settings

_model = None
_model_path: str | None = None
_load_error: str | None = None


def resolve_weights(override: str | None = None) -> Path:
    if override:
        p = Path(override)
        if p.exists():
            return p
    p = Path(settings.model_path)
    if p.exists():
        return p
    fallback = Path(settings.model_path).parent / "best.pt"
    return fallback if fallback.exists() else p


def model_status() -> dict[str, Any]:
    path = resolve_weights()
    loaded = _model is not None
    names: list[str] = []
    task = "unknown"
    device = "cpu"
    if _model is not None:
        names = [str(v) for v in (_model.names.values() if isinstance(_model.names, dict) else _model.names)]
        task = getattr(_model, "task", "detect") or "detect"
        device = str(getattr(_model, "device", "cpu"))
    return {
        "loaded": loaded,
        "path": str(path),
        "exists": path.exists(),
        "name": path.name if path.exists() else None,
        "classes": names,
        "task": task,
        "device": device,
        "error": _load_error,
        "onnx_available": (path.with_suffix(".onnx").exists() if path.exists() else False),
    }


def get_model(override: str | None = None):
    global _model, _model_path, _load_error
    path = str(resolve_weights(override))
    if not Path(path).exists():
        _load_error = f"Weights not found: {path}"
        _model = None
        _model_path = None
        return None
    if _model is not None and _model_path == path:
        return _model
    from ultralytics import YOLO

    try:
        _model = YOLO(path)
        _model_path = path
        _load_error = None
        return _model
    except Exception as exc:  # noqa: BLE001
        _load_error = str(exc)
        _model = None
        _model_path = None
        return None


def class_name_from_model(model, cls_id: int) -> str:
    names = model.names
    if isinstance(names, dict):
        return str(names.get(cls_id, names.get(str(cls_id), f"class_{cls_id}")))
    if 0 <= cls_id < len(names):
        return str(names[cls_id])
    return f"class_{cls_id}"


def run_inference(
    prepared_bgr: np.ndarray,
    conf: float,
    iou: float,
    model_path: str | None = None,
) -> dict[str, Any]:
    model = get_model(model_path)
    if model is None:
        return {"ok": False, "error": _load_error or "AI model not loaded", "boxes": [], "masks": [], "task": None}
    results = model.predict(prepared_bgr, conf=conf, iou=iou, verbose=False, imgsz=320)
    boxes: list[dict[str, Any]] = []
    masks: list[np.ndarray] = []
    task = getattr(model, "task", "detect")
    for r in results:
        if r.boxes is None:
            continue
        mdata = None
        if getattr(r, "masks", None) is not None and r.masks is not None:
            mdata = r.masks.data.cpu().numpy()
        for i, box in enumerate(r.boxes):
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            cls_id = int(box.cls[0])
            boxes.append(
                {
                    "xyxy": xyxy,
                    "class_id": cls_id,
                    "class_name": class_name_from_model(model, cls_id),
                    "confidence": float(box.conf[0]),
                }
            )
            if mdata is not None and i < len(mdata):
                masks.append(mdata[i])
    return {"ok": True, "boxes": boxes, "masks": masks, "task": task, "error": None}
