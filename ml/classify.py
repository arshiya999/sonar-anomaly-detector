"""Shape / acoustic geometry votes so YOLO is not stuck on one class (often shipwreck)."""

from __future__ import annotations

import math
from typing import Any

import cv2
import numpy as np

from preprocess import is_polar_pipe_scan, to_gray

CLASSES = (
    "ghost_net",
    "debris",
    "shipwreck",
    "aircraft",
    "propeller",
    "tire",
    "cylinder",
    "diver",
)


def _crop(gray: np.ndarray, xyxy: list[float]) -> np.ndarray:
    h, w = gray.shape[:2]
    x1, y1, x2, y2 = [int(round(v)) for v in xyxy]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, max(x1 + 2, x2)), min(h, max(y1 + 2, y2))
    return gray[y1:y2, x1:x2]


def _entropy(gray: np.ndarray) -> float:
    hist = cv2.calcHist([gray], [0], None, [32], [0, 256]).ravel()
    p = hist / max(float(hist.sum()), 1.0)
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum() / 5.0)


def geometry_votes(gray: np.ndarray, xyxy: list[float] | None = None) -> dict[str, float]:
    """Return 0–1 votes per class from box (or full-frame) shape."""
    votes = {c: 0.05 for c in CLASSES}
    roi = gray if xyxy is None else _crop(gray, xyxy)
    if roi.size < 80:
        return votes
    h, w = roi.shape[:2]
    aspect = max(w, h) / max(1, min(w, h))
    blur = cv2.GaussianBlur(roi, (5, 5), 0)
    _, binary = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(roi.mean()) > 90:
        binary = cv2.bitwise_not(binary)
    cnts, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return votes
    cnt = max(cnts, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    peri = float(cv2.arcLength(cnt, True)) + 1e-6
    circ = float(4.0 * math.pi * area / (peri * peri))
    hull = cv2.convexHull(cnt)
    hull_a = float(cv2.contourArea(hull)) + 1e-6
    solidity = float(area / hull_a)
    bx, by, bw, bh = cv2.boundingRect(cnt)
    cx, cy = bx + bw / 2.0, by + bh / 2.0
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    r = 0.5 * max(bw, bh, 8)
    inner = roi[dist < 0.22 * r]
    ring = roi[(dist > 0.32 * r) & (dist < 0.88 * r)]
    inner_m = float(inner.mean()) if inner.size else 0.0
    ring_m = float(ring.mean()) if ring.size else 0.0
    hole = (ring_m - inner_m) > 18.0
    ent = _entropy(roi)
    # polar borehole / pipe
    if is_polar_pipe_scan(gray):
        votes["cylinder"] += 0.95
    if aspect >= 2.4:
        votes["cylinder"] += 0.55
        votes["diver"] += 0.25
    if hole and 0.85 <= aspect <= 2.2:
        votes["tire"] += 0.95
        votes["propeller"] += 0.15
    if circ >= 0.22 and not hole and 0.9 <= aspect <= 1.45:
        votes["propeller"] += 0.75
        votes["tire"] += 0.2
    if circ < 0.14 and solidity < 0.78:
        votes["aircraft"] += 0.9
        votes["shipwreck"] += 0.15
    elif circ < 0.16 and ent > 0.55:
        votes["ghost_net"] += 0.85
        votes["propeller"] += 0.1
    if 0.28 <= circ <= 0.72 and solidity > 0.88 and aspect < 2.1:
        votes["shipwreck"] += 0.7
        votes["debris"] += 0.25
    if circ < 0.2 and ent > 0.62:
        votes["ghost_net"] += 0.45
    if solidity < 0.4 and aspect > 1.5:
        votes["diver"] += 0.7
    if 0.15 <= circ <= 0.45 and solidity > 0.85:
        votes["debris"] += 0.35
    mx = max(votes.values()) or 1.0
    return {k: round(v / mx, 4) for k, v in votes.items()}


def refine_class(
    yolo_name: str,
    yolo_conf: float,
    gray: np.ndarray,
    xyxy: list[float],
    frame_votes: dict[str, float] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Blend YOLO class with geometry so aircraft/pipe/net/propeller are not collapsed to shipwreck."""
    name = yolo_name if yolo_name in CLASSES else "debris"
    votes = geometry_votes(gray, xyxy)
    if frame_votes:
        votes = {c: round(0.55 * votes.get(c, 0) + 0.45 * frame_votes.get(c, 0), 4) for c in CLASSES}
        mx = max(votes.values()) or 1.0
        votes = {k: round(v / mx, 4) for k, v in votes.items()}
    scores = {c: 0.22 * votes.get(c, 0.0) for c in CLASSES}
    scores[name] = scores.get(name, 0.0) + min(1.0, max(0.12, yolo_conf))
    if name == "shipwreck" and yolo_conf < 0.72 and votes.get("aircraft", 0) >= 0.55:
        scores["aircraft"] += 0.7
    if name == "shipwreck" and yolo_conf < 0.5 and votes.get("ghost_net", 0) >= 0.55:
        scores["ghost_net"] += 0.4
    if name == "propeller" and votes.get("ghost_net", 0) > 0.7:
        scores["ghost_net"] += 0.6
        scores["propeller"] *= 0.5
    if votes.get("cylinder", 0) > 0.85 and yolo_conf < 0.55:
        scores["cylinder"] += 0.45
    if votes.get("tire", 0) > 0.9 and name in {"debris", "propeller", "shipwreck"}:
        scores["tire"] += 0.35
    best = max(scores, key=scores.get)
    if yolo_conf >= 0.78 and votes.get(name, 0) >= 0.35:
        best = name
    return best, {"yolo_class": name, "yolo": round(yolo_conf, 4), "geom": votes.get(best, 0.0)}


def nms_detections(dets: list[dict[str, Any]], iou_thresh: float = 0.55) -> list[dict[str, Any]]:
    """Keep the strongest box when several overlap after class refine."""
    if len(dets) <= 1:
        return dets

    def iou(a: list[float], b: list[float]) -> float:
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
        inter = iw * ih
        ua = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1) + max(0.0, bx2 - bx1) * max(0.0, by2 - by1) - inter
        return inter / ua if ua > 0 else 0.0

    order = sorted(dets, key=lambda d: d["confidence"], reverse=True)
    keep: list[dict[str, Any]] = []
    for d in order:
        if any(iou(d["bbox_xyxy"], k["bbox_xyxy"]) > iou_thresh for k in keep):
            continue
        keep.append(d)
    return keep
