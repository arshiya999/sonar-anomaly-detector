"""Configurable SSS preprocessing. Acoustic shadows are preserved by default."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class PreprocessConfig:
    lee_size: int = 5
    clahe_clip: float = 2.4
    use_lee: bool = True
    use_clahe: bool = True
    inpaint_dropouts: bool = True


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def lee_filter(image: np.ndarray, size: int = 5) -> np.ndarray:
    img = image.astype(np.float32)
    mean = cv2.blur(img, (size, size))
    mean_sq = cv2.blur(img * img, (size, size))
    var = np.clip(mean_sq - mean * mean, 0, None)
    overall = float(np.var(img) + 1e-6)
    w = var / (var + overall)
    out = mean + w * (img - mean)
    return np.clip(out, 0, 255).astype(np.uint8)


def inpaint_dropouts(gray: np.ndarray) -> tuple[np.ndarray, float]:
    """Fill thin black stripes typical of heave/pitch dropouts. Returns (image, dropout_fraction)."""
    mask = (gray < 6).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    frac = float((mask > 0).mean())
    if int(mask.sum()) == 0:
        return gray, 0.0
    return cv2.inpaint(gray, mask, 3, cv2.INPAINT_TELEA), frac


def enhance(gray: np.ndarray, clip: float = 2.4) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=float(clip), tileGridSize=(8, 8))
    return clahe.apply(gray)


def resize_variable_resolution(gray: np.ndarray, max_side: int = 1600) -> np.ndarray:
    h, w = gray.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return gray
    scale = max_side / m
    return cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def prepare_for_detector(bgr_or_gray: np.ndarray, cfg: PreprocessConfig | None = None) -> np.ndarray:
    cfg = cfg or PreprocessConfig()
    gray = to_gray(bgr_or_gray)
    gray = resize_variable_resolution(gray)
    if cfg.inpaint_dropouts:
        gray, _ = inpaint_dropouts(gray)
    if cfg.use_lee:
        gray = lee_filter(gray, cfg.lee_size if cfg.lee_size % 2 else cfg.lee_size + 1)
    if cfg.use_clahe:
        gray = enhance(gray, cfg.clahe_clip)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def acoustic_shadow_map(gray: np.ndarray) -> np.ndarray:
    """Highlight low-return regions without deleting them from the source image."""
    g = to_gray(gray)
    _, binary = cv2.threshold(g, 22, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)


def overlay_shadow(bgr: np.ndarray, shadow: np.ndarray) -> np.ndarray:
    vis = bgr.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    tint = vis.copy()
    tint[shadow > 0] = (40, 40, 180)
    return cv2.addWeighted(vis, 0.72, tint, 0.28, 0)
