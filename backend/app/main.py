from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import STORAGE, settings
from app.database import Base, engine
from app.hub import hub, pending
from app.pipeline.infer import get_model, model_status
from app.api import bridge, detections, reports, sonar, surveys, system

log = logging.getLogger("aqua")
logging.basicConfig(level=settings.log_level)


async def _drain_ws() -> None:
    import queue as q

    while True:
        try:
            room, payload = pending.get_nowait()
        except q.Empty:
            await asyncio.sleep(0.05)
            continue
        await hub.broadcast(room, payload)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    get_model()
    task = asyncio.create_task(_drain_ws())
    yield
    task.cancel()


BUILD = "2026.09.23-console"

app = FastAPI(
    title="Aqua Vision",
    description="SIH26057 — AI-powered side-scan sonar debris and anomaly detection",
    version="1.0.0",
    lifespan=lifespan,
)
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if "*" not in origins:
    origins.extend(
        [
            "https://aqua-vision-sih.vercel.app",
            "http://127.0.0.1:47281",
            "http://localhost:47281",
        ]
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

STORAGE.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(STORAGE)), name="media")

app.include_router(system.router, prefix="/api")
app.include_router(bridge.router, prefix="/api")
app.include_router(sonar.router, prefix="/api")
app.include_router(surveys.router, prefix="/api")
app.include_router(detections.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


async def _ws(room: str, ws: WebSocket) -> None:
    await ws.accept()
    await hub.join(room, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.leave(room, ws)


@app.websocket("/ws/sonar")
async def ws_sonar(ws: WebSocket):
    await _ws("sonar", ws)


@app.websocket("/ws/detections")
async def ws_detections(ws: WebSocket):
    await _ws("detections", ws)


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await _ws("alerts", ws)


@app.get("/")
def root():
    status = model_status()
    return {
        "service": "Aqua Vision ops API",
        "ok": True,
        "build": BUILD,
        "health": "/health",
        "detect": "POST /detect",
        "ingest": "POST /api/ingest/ml-report",
        "log": "GET /api/ops/log",
        "system": "GET /api/system/status",
        "model_loaded": bool(status.get("loaded")),
    }


@app.get("/health")
@app.get("/api/health")
def health():
    status = model_status()
    return {
        "ok": bool(status.get("loaded")),
        "build": BUILD,
        "weights": status.get("path"),
        "weights_exist": bool(status.get("exists")),
        "trained": True,
        "service": "aqua-vision",
        "model": status,
    }


@app.post("/detect")
async def detect(
    image: UploadFile = File(...),
    metadata: str = Form("{}"),
    conf_threshold: float = Form(0.22),
    return_overlay: bool = Form(True),
):
    """Same contract as ml/server.py so the website can use this host when the ML service is asleep."""
    import base64
    import json
    import sys
    from pathlib import Path

    import cv2
    import numpy as np
    from fastapi.responses import JSONResponse

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

    ml_root = Path(__file__).resolve().parents[2] / "ml"
    if ml_root.is_dir() and str(ml_root) not in sys.path:
        sys.path.insert(0, str(ml_root))
    from geotag import merge_gps_metadata
    from infer import annotate, detect_image

    meta = merge_gps_metadata(meta, raw)
    report = detect_image(bgr, meta=meta, conf_threshold=float(conf_threshold))
    overlay_b64 = None
    if return_overlay:
        vis = annotate(bgr, report)
        ok, buf = cv2.imencode(".jpg", vis, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if ok:
            overlay_b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return {"report": report, "overlay_jpeg_base64": overlay_b64}
