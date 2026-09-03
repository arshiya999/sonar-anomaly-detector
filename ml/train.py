#!/usr/bin/env python3
"""Fine-tune YOLO11n on real sonar debris / wreck imagery (CPU-friendly)."""

from __future__ import annotations

import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "yolo" / "data.yaml"
WEIGHTS = ROOT / "weights"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=18)
    parser.add_argument("--imgsz", type=int, default=320)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--model", default="yolo11n.pt")
    args = parser.parse_args()

    if not DATA.exists():
        raise SystemExit("Run prepare_dataset.py first.")

    WEIGHTS.mkdir(parents=True, exist_ok=True)
    model = YOLO(args.model)
    results = model.train(
        data=str(DATA),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device="cpu",
        workers=2,
        patience=8,
        project=str(ROOT / "runs"),
        name="sonar-debris",
        exist_ok=True,
        pretrained=True,
        optimizer="AdamW",
        lr0=0.002,
        lrf=0.01,
        hsv_h=0.015,
        hsv_s=0.4,
        hsv_v=0.5,
        degrees=8.0,
        translate=0.08,
        scale=0.4,
        fliplr=0.5,
        mosaic=0.6,
        mixup=0.05,
        close_mosaic=4,
        plots=True,
        verbose=True,
    )
    best = Path(results.save_dir) / "weights" / "best.pt"
    dest = WEIGHTS / "sonar-debris-yolo11n.pt"
    if best.exists():
        dest.write_bytes(best.read_bytes())
        print("saved", dest)
        try:
            YOLO(str(dest)).export(format="onnx", imgsz=args.imgsz, simplify=True)
            onnx_src = dest.with_suffix(".onnx")
            if onnx_src.exists():
                print("exported", onnx_src)
        except Exception as exc:  # noqa: BLE001
            print("ONNX export skipped:", exc)


if __name__ == "__main__":
    main()
