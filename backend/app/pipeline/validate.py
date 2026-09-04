"""False-positive filter: rocks, ripples, shadows, speckle vs man-made returns."""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.pipeline.preprocess import acoustic_shadow_map, to_gray


def box_contrast_score(gray: np.ndarray, xyxy: list[float]) -> float:
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 4 or y2 - y1 < 4:
        return 0.2
    crop = gray[y1:y2, x1:x2]
    pad = 12
    ctx = gray[max(0, y1 - pad) : min(h, y2 + pad), max(0, x1 - pad) : min(w, x2 + pad)]
    mu, sigma = float(crop.mean()), float(crop.std() + 1e-3)
    ctx_mu = float(ctx.mean())
    contrast = abs(mu - ctx_mu) / 40.0
    texture = min(1.0, sigma / 28.0)
    return float(np.clip(0.35 + 0.4 * contrast + 0.25 * texture, 0.15, 1.0))


def shadow_features(gray: np.ndarray, xyxy: list[float]) -> dict[str, float]:
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    crop = gray[y1:y2, x1:x2]
    if crop.size == 0:
        return {"dark_frac": 1.0, "aspect": 1.0, "shadow_intensity": 0.0, "shadow_adj": 0.0}
    dark_frac = float((crop < 18).mean())
    aspect = (x2 - x1 + 1) / max(1, (y2 - y1))
    smap = acoustic_shadow_map(gray)
    below = smap[min(h - 1, y2) : min(h, y2 + max(8, (y2 - y1))), x1:x2]
    shadow_adj = float((below > 0).mean()) if below.size else 0.0
    return {
        "dark_frac": round(dark_frac, 4),
        "aspect": round(aspect, 3),
        "shadow_intensity": round(float(crop.mean()), 2),
        "shadow_adj": round(shadow_adj, 4),
    }


def ripple_score(gray: np.ndarray, xyxy: list[float]) -> float:
    """Periodic sand-ripple texture tends to have a strong dominant orientation."""
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    crop = gray[max(0, y1) : min(h, y2), max(0, x1) : min(w, x2)]
    if crop.size < 64:
        return 0.0
    gx = cv2.Sobel(crop, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(crop, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)
    if float(mag.mean()) < 4:
        return 0.0
    ang = (np.arctan2(gy, gx) + np.pi) / (2 * np.pi)
    hist, _ = np.histogram(ang, bins=8, range=(0, 1), weights=mag)
    peak = float(hist.max() / (hist.sum() + 1e-6))
    return float(peak)


def validate_detection(
    yolo_conf: float,
    gray: np.ndarray,
    xyxy: list[float],
    class_name: str,
    shadow_filter: bool = True,
) -> dict[str, Any]:
    contrast = box_contrast_score(gray, xyxy)
    sh = shadow_features(gray, xyxy)
    ripple = ripple_score(gray, xyxy)
    shadow_pen = 1.0
    reasons: list[str] = []
    if shadow_filter and sh["dark_frac"] > 0.72 and sh["aspect"] > 2.4:
        shadow_pen = 0.35
        reasons.append("uniform acoustic-shadow streak")
    elif shadow_filter and sh["dark_frac"] > 0.85:
        shadow_pen = 0.45
        reasons.append("near-zero acoustic return (likely shadow/dropout)")
    if ripple > 0.42:
        shadow_pen *= 0.7
        reasons.append("periodic seafloor ripple texture")
    if contrast < 0.28:
        reasons.append("weak object-to-seafloor contrast")

    fused = float(np.clip(yolo_conf * (0.55 + 0.45 * contrast) * shadow_pen, 0.0, 0.99))
    raw_pct = round(yolo_conf * 100.0, 1)
    final_pct = round(fused * 100.0, 1)

    if shadow_pen <= 0.4 and fused < 0.35:
        status = "REJECTED"
    elif fused >= 0.80 and contrast >= 0.4:
        status = "CONFIRMED"
    elif fused >= 0.50:
        status = "LIKELY"
    else:
        status = "UNCERTAIN"

    man_made = {
        "shipwreck",
        "aircraft",
        "ghost_net",
        "cylinder",
        "pipe",
        "propeller",
        "tire",
        "debris",
        "diver",
    }
    if class_name.lower() in man_made and status == "CONFIRMED":
        risk = "HIGH" if final_pct > 80 else "MEDIUM"
    elif status == "REJECTED":
        risk = "LOW"
    elif final_pct > 80:
        risk = "HIGH"
    elif final_pct >= 50:
        risk = "MEDIUM"
    else:
        risk = "LOW"

    if not reasons:
        reasons.append("passed shadow/contrast/ripple checks")

    return {
        "raw_confidence": raw_pct,
        "final_confidence": final_pct,
        "validation_status": status,
        "risk_level": risk,
        "reason": "; ".join(reasons),
        "features": {
            "yolo": round(yolo_conf, 4),
            "contrast": round(contrast, 4),
            "ripple": round(ripple, 4),
            **sh,
            "shadow_penalty": shadow_pen,
        },
    }
