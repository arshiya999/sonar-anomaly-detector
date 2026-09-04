"""Frame data-quality. Does not invent heave/pitch/roll."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.pipeline.preprocess import inpaint_dropouts, to_gray


def assess_frame(image: np.ndarray, meta: dict[str, Any]) -> dict[str, Any]:
    gray = to_gray(image)
    _, dropout_frac = inpaint_dropouts(gray)
    std = float(gray.std())
    completeness = float(np.clip(1.0 - dropout_frac * 4.0, 0.0, 1.0))
    quality = float(np.clip((std / 40.0) * completeness, 0.0, 1.0))
    motion_keys = ("heave", "pitch", "roll", "heave_m", "pitch_deg", "roll_deg")
    motion_present = any(meta.get(k) is not None for k in motion_keys)
    missing = []
    for k in ("latitude", "longitude", "heading", "heading_deg", "depth", "altitude"):
        if meta.get(k) is None:
            missing.append(k)
    flags = {
        "dropout_fraction": round(dropout_frac, 4),
        "intensity_std": round(std, 2),
        "missing_metadata": missing,
        "motion_compensation": "present" if motion_present else "unavailable",
    }
    if dropout_frac > 0.02:
        flags["artefact"] = "possible_heave_pitch_dropout"
    return {
        "quality_score": round(quality, 4),
        "completeness": round(completeness, 4),
        "motion_available": motion_present,
        "flags": flags,
    }
