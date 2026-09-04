from __future__ import annotations

import base64
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import STORAGE
from app.database import get_db
from app.models import Detection, DetectionValidation, GpsTrack, Report, SonarFrame, SonarMetadata, Survey
from app.services.processor import media_url

router = APIRouter()

HAZARD = {
    "ghost_net": 95,
    "shipwreck": 88,
    "aircraft": 86,
    "propeller": 70,
    "tire": 62,
    "cylinder": 68,
    "debris": 55,
    "diver": 90,
}


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return datetime.utcnow().isoformat() + "Z"
    text = dt.isoformat()
    if text.endswith("Z") or "+" in text[10:] or text.endswith("+00:00"):
        return text
    return text + "Z"


class MlIngest(BaseModel):
    filename: str
    report: dict
    overlay_jpeg_base64: str | None = None


def _save_overlay(survey_id: str, b64: str | None) -> str | None:
    if not b64:
        return None
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    d = STORAGE / survey_id
    d.mkdir(parents=True, exist_ok=True)
    path = d / "overlay.jpg"
    cv2.imwrite(str(path), img)
    return str(path)


@router.post("/ingest/ml-report")
def ingest_ml_report(body: MlIngest, db: Session = Depends(get_db)):
    existing = (
        db.query(Survey)
        .filter(Survey.source_name == body.filename, Survey.status == "completed")
        .first()
    )
    if existing:
        return {"ok": True, "survey_id": existing.id, "deduped": True}

    report = body.report
    meta = report.get("metadata") if isinstance(report.get("metadata"), dict) else {}
    dets = report.get("detections") or []
    survey = Survey(
        name=str(report.get("survey_id") or meta.get("survey") or body.filename),
        source_type="upload",
        source_name=body.filename,
        status="completed",
        frames_count=1,
        detections_count=len(dets),
        alerts_count=sum(1 for d in dets if float(d.get("confidence") or 0) > 80),
        model_name=str(report.get("model") or "yolo"),
        started_at=datetime.utcnow(),
        ended_at=datetime.utcnow(),
    )
    db.add(survey)
    db.flush()
    overlay_path = _save_overlay(survey.id, body.overlay_jpeg_base64)
    size = report.get("image_size") or {}
    w = int(size.get("width") or 0)
    h = int(size.get("height") or 0)
    lat0 = meta.get("latitude")
    lon0 = meta.get("longitude")
    frame = SonarFrame(
        survey_id=survey.id,
        frame_seq=0,
        ping_number=None,
        timestamp=datetime.utcnow(),
        image_path=overlay_path or "",
        overlay_path=overlay_path,
        quality_score=1.0,
        completeness=1.0,
        motion_available=False,
        artefact_flags={"motion_compensation": "unavailable"},
        inference_ms=int(report.get("inference_ms") or 0),
    )
    db.add(frame)
    db.flush()
    db.add(
        SonarMetadata(
            frame_id=frame.id,
            latitude=float(lat0) if lat0 is not None else None,
            longitude=float(lon0) if lon0 is not None else None,
            heading=float(meta["heading_deg"]) if meta.get("heading_deg") is not None else None,
            gps_available=lat0 is not None and lon0 is not None,
            motion_compensation="unavailable",
            extra=meta,
            resolution_x=float(meta["meters_per_pixel_x"]) if meta.get("meters_per_pixel_x") is not None else None,
            resolution_y=float(meta["meters_per_pixel_y"]) if meta.get("meters_per_pixel_y") is not None else None,
        )
    )
    if lat0 is not None and lon0 is not None:
        db.add(
            GpsTrack(
                survey_id=survey.id,
                seq=0,
                latitude=float(lat0),
                longitude=float(lon0),
                timestamp=datetime.utcnow(),
            )
        )
    for d in dets:
        xyxy = d.get("bbox_xyxy") or [0, 0, 0, 0]
        x1, y1, x2, y2 = [float(v) for v in xyxy]
        conf = float(d.get("confidence") or 0)
        status = "CONFIRMED" if conf > 80 else "LIKELY" if conf >= 50 else "UNCERTAIN"
        risk = "HIGH" if conf > 80 else "MEDIUM" if conf >= 50 else "LOW"
        dims = d.get("dimensions") or {}
        row = Detection(
            survey_id=survey.id,
            frame_id=frame.id,
            class_name=str(d.get("class") or "unknown"),
            raw_confidence=conf,
            final_confidence=conf,
            validation_status=status,
            risk_level=risk,
            x=x1,
            y=y1,
            width=max(0.0, x2 - x1),
            height=max(0.0, y2 - y1),
            width_m=dims.get("width_m"),
            length_m=dims.get("length_m"),
            latitude=d.get("latitude"),
            longitude=d.get("longitude"),
            timestamp=datetime.utcnow(),
        )
        db.add(row)
        db.flush()
        db.add(
            DetectionValidation(
                detection_id=row.id,
                raw_confidence=row.raw_confidence,
                final_confidence=row.final_confidence,
                validation_status=status,
                risk_level=risk,
                reason="YOLO fused confidence from sonar frame",
                features=d.get("confidence_parts") or {},
            )
        )
    db.add(Report(survey_id=survey.id))
    db.commit()
    return {"ok": True, "survey_id": survey.id, "deduped": False, "image_size": {"width": w, "height": h}}


@router.get("/ops/log")
def ops_log(db: Session = Depends(get_db)):
    surveys = db.query(Survey).order_by(Survey.created_at.desc()).all()
    out = []
    for s in surveys:
        frame = db.query(SonarFrame).filter(SonarFrame.survey_id == s.id).order_by(SonarFrame.frame_seq).first()
        dets = db.query(Detection).filter(Detection.survey_id == s.id).all()
        overlay = media_url(frame.overlay_path) if frame else None
        image = media_url(frame.image_path) if frame else None
        packed = []
        for d in dets:
            packed.append(
                {
                    "id": d.id,
                    "class": d.class_name,
                    "hazard_score": HAZARD.get(d.class_name, 50),
                    "confidence": d.final_confidence,
                    "confidence_parts": {"yolo": d.raw_confidence / 100, "contrast": 1, "shadow": 1},
                    "bbox_xyxy": [d.x, d.y, d.x + d.width, d.y + d.height],
                    "center_px": [d.x + d.width / 2, d.y + d.height / 2],
                    "latitude": d.latitude,
                    "longitude": d.longitude,
                    "dimensions": {
                        "width_m": d.width_m,
                        "length_m": d.length_m,
                        "width_px": d.width,
                        "height_px": d.height,
                    },
                    "overlay_url": overlay,
                    "image_url": image,
                }
            )
        out.append(
            {
                "id": s.id,
                "at": _iso(s.created_at),
                "filename": s.source_name,
                "survey": s.name,
                "count": s.detections_count,
                "inference_ms": frame.inference_ms if frame else 0,
                "threshold": 0.22,
                "detections": packed,
            }
        )
    return {"entries": out}
