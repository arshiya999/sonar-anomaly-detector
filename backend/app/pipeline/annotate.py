from __future__ import annotations

import cv2
import numpy as np


def annotate(image: np.ndarray, detections: list[dict], show_masks: bool = True) -> np.ndarray:
    vis = image.copy()
    if vis.ndim == 2:
        vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
    for det in detections:
        x, y, w, h = det["x"], det["y"], det["width"], det["height"]
        x1, y1, x2, y2 = int(x), int(y), int(x + w), int(y + h)
        conf = det["final_confidence"]
        if conf > 80:
            color = (50, 50, 220)
        elif conf >= 50:
            color = (20, 140, 255)
        else:
            color = (60, 180, 60)
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)
        label = f"{det['class_name']} {conf:.0f}%"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(vis, (x1, max(0, y1 - th - 8)), (x1 + tw + 6, y1), color, -1)
        cv2.putText(vis, label, (x1 + 3, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        if show_masks and det.get("mask") is not None:
            mask = det["mask"]
            if mask.shape[:2] != vis.shape[:2]:
                mask = cv2.resize(mask.astype(np.uint8), (vis.shape[1], vis.shape[0]), interpolation=cv2.INTER_NEAREST)
            tint = vis.copy()
            tint[mask > 0.5] = color
            vis = cv2.addWeighted(vis, 0.85, tint, 0.15, 0)
    return vis
