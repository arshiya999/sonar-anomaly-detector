#!/usr/bin/env python3
"""Inference API for the sonar debris dashboard."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from infer import annotate, detect_image, get_model, report_to_csv, resolve_weights  # noqa: E402

app = FastAPI(title="NIOT Marine Debris Detector", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    weights = resolve_weights()
    return {
        "ok": True,
        "weights": str(weights),
        "weights_exist": weights.exists(),
        "trained": "sonar-debris" in weights.name or weights.name == "best.pt",
    }


@app.on_event("startup")
def warmup():
    get_model()


@app.post("/detect")
async def detect(
    image: UploadFile = File(...),
    metadata: str = Form("{}"),
    conf_threshold: float = Form(0.22),
    return_overlay: bool = Form(True),
):
    raw = await image.read()
    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return JSONResponse({"error": "Could not decode image"}, status_code=400)
    try:
        meta = json.loads(metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    report = detect_image(bgr, meta=meta, conf_threshold=conf_threshold)
    overlay_b64 = None
    if return_overlay:
        import base64

        vis = annotate(bgr, report)
        ok, buf = cv2.imencode(".jpg", vis, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        if ok:
            overlay_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return {"report": report, "overlay_jpeg_base64": overlay_b64}


@app.post("/report.csv")
async def detect_csv(
    image: UploadFile = File(...),
    metadata: str = Form("{}"),
    conf_threshold: float = Form(0.22),
):
    raw = await image.read()
    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        return JSONResponse({"error": "Could not decode image"}, status_code=400)
    try:
        meta = json.loads(metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    report = detect_image(bgr, meta=meta, conf_threshold=conf_threshold)
    return Response(content=report_to_csv(report), media_type="text/csv")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8765, reload=False)
