"""Acoustic image pre-processing: speckle reduction, CLAHE, dropout inpaint."""

from __future__ import annotations

import cv2
import numpy as np


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def lee_filter(image: np.ndarray, size: int = 5) -> np.ndarray:
    """Lee speckle filter for side-scan / FLS intensity images."""
    img = image.astype(np.float32)
    mean = cv2.blur(img, (size, size))
    mean_sq = cv2.blur(img * img, (size, size))
    var = np.clip(mean_sq - mean * mean, 0, None)
    overall = float(np.var(img) + 1e-6)
    w = var / (var + overall)
    out = mean + w * (img - mean)
    return np.clip(out, 0, 255).astype(np.uint8)


def inpaint_dropouts(gray: np.ndarray) -> np.ndarray:
    """Fill thin black stripes typical of heave/pitch dropouts."""
    mask = (gray < 6).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    if int(mask.sum()) == 0:
        return gray
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA)


def enhance(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(8, 8))
    return clahe.apply(gray)


def prepare_for_detector(bgr_or_gray: np.ndarray) -> np.ndarray:
    gray = to_gray(bgr_or_gray)
    gray = inpaint_dropouts(gray)
    gray = lee_filter(gray, 5)
    gray = enhance(gray)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def box_contrast_score(gray: np.ndarray, xyxy: list[float]) -> float:
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 - x1 < 4 or y2 - y1 < 4:
        return 0.2
    crop = gray[y1:y2, x1:x2]
    pad = 12
    y1e, y2e = max(0, y1 - pad), min(h, y2 + pad)
    x1e, x2e = max(0, x1 - pad), min(w, x2 + pad)
    ctx = gray[y1e:y2e, x1e:x2e]
    mu, sigma = float(crop.mean()), float(crop.std() + 1e-3)
    ctx_mu = float(ctx.mean())
    contrast = abs(mu - ctx_mu) / 40.0
    texture = min(1.0, sigma / 28.0)
    return float(np.clip(0.35 + 0.4 * contrast + 0.25 * texture, 0.15, 1.0))


def shadow_penalty(gray: np.ndarray, xyxy: list[float]) -> float:
    """Down-weight detections sitting in uniform acoustic shadows."""
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in xyxy]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    crop = gray[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.5
    dark_frac = float((crop < 18).mean())
    aspect = (x2 - x1 + 1) / max(1, (y2 - y1))
    # long dark streaks are typical shadows, not debris
    if dark_frac > 0.72 and aspect > 2.4:
        return 0.35
    if dark_frac > 0.85:
        return 0.45
    return 1.0
