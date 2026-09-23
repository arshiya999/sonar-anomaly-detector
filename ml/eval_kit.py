#!/usr/bin/env python3
"""Image-level eval of public/samples against manifest example_class. Writes src/lib/kit-eval.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from infer import CLASS_NAMES, detect_image  # noqa: E402

SAMPLES = ROOT.parent / "public" / "samples"
OUT = ROOT.parent / "src" / "lib" / "kit-eval.json"


def main() -> None:
    manifest = json.loads((SAMPLES / "manifest.json").read_text())
    names = list(CLASS_NAMES)
    idx = {n: i for i, n in enumerate(names)}
    confusion = [[0 for _ in names] for _ in names]
    per = {n: {"tp": 0, "fp": 0, "fn": 0, "support": 0} for n in names}
    pairs = []
    for item in manifest:
        path = SAMPLES / item["file"]
        gt = item["example_class"]
        if not path.exists() or gt not in idx:
            continue
        bgr = cv2.imread(str(path))
        if bgr is None:
            continue
        report = detect_image(bgr, meta={}, conf_threshold=0.22)
        dets = report.get("detections") or []
        pred = dets[0]["class"] if dets else "none"
        pairs.append({"file": item["file"], "gt": gt, "pred": pred})
        per[gt]["support"] += 1
        if pred == gt:
            per[gt]["tp"] += 1
            confusion[idx[gt]][idx[pred]] += 1
        else:
            per[gt]["fn"] += 1
            if pred in idx:
                per[pred]["fp"] += 1
                confusion[idx[gt]][idx[pred]] += 1
    tp = sum(v["tp"] for v in per.values())
    n = len(pairs)
    precisions, recalls, f1s = [], [], []
    per_class = []
    for name in names:
        s = per[name]
        p = s["tp"] / (s["tp"] + s["fp"]) if (s["tp"] + s["fp"]) else None
        r = s["tp"] / s["support"] if s["support"] else None
        f1 = (2 * p * r / (p + r)) if p is not None and r is not None and (p + r) else None
        if p is not None:
            precisions.append(p)
        if r is not None:
            recalls.append(r)
        if f1 is not None:
            f1s.append(f1)
        per_class.append(
            {
                "classId": name,
                "support": s["support"],
                "precision": None if p is None else round(p, 4),
                "recall": None if r is None else round(r, 4),
                "f1": None if f1 is None else round(f1, 4),
            }
        )
    payload = {
        "source": "Operator kit, image-level vs example_class in public/samples/manifest.json",
        "n": n,
        "correct": tp,
        "precision": round(sum(precisions) / len(precisions), 4) if precisions else 0,
        "recall": round(sum(recalls) / len(recalls), 4) if recalls else 0,
        "f1": round(sum(f1s) / len(f1s), 4) if f1s else 0,
        "accuracy": round(tp / n, 4) if n else 0,
        "perClass": per_class,
        "confusion": confusion,
        "pairs": pairs,
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({k: payload[k] for k in ("n", "correct", "precision", "recall", "f1", "accuracy")}, indent=2))


if __name__ == "__main__":
    main()
