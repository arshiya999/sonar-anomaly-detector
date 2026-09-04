from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import STORAGE, settings
from app.database import SessionLocal, get_db
from app.ingest.raster import load_sidecar_metadata
from app.models import GpsTrack, SonarFrame, Survey
from app.services.processor import media_url, process_upload

router = APIRouter()
MAX = settings.max_upload_mb * 1024 * 1024


@router.get("/surveys")
def list_surveys(db: Session = Depends(get_db)):
    rows = db.query(Survey).order_by(Survey.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "source_type": s.source_type,
            "source_name": s.source_name,
            "status": s.status,
            "frames": s.frames_count,
            "detections": s.detections_count,
            "alerts": s.alerts_count,
            "model": s.model_name,
            "created_at": s.created_at,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "error": s.error,
        }
        for s in rows
    ]


@router.get("/surveys/{survey_id}")
def get_survey(survey_id: str, db: Session = Depends(get_db)):
    s = db.get(Survey, survey_id)
    if not s:
        raise HTTPException(404, "Survey not found")
    frames = db.query(SonarFrame).filter(SonarFrame.survey_id == survey_id).order_by(SonarFrame.frame_seq).all()
    track = db.query(GpsTrack).filter(GpsTrack.survey_id == survey_id).order_by(GpsTrack.seq).all()
    return {
        "id": s.id,
        "name": s.name,
        "status": s.status,
        "source_type": s.source_type,
        "source_name": s.source_name,
        "frames": s.frames_count,
        "detections": s.detections_count,
        "alerts": s.alerts_count,
        "model": s.model_name,
        "error": s.error,
        "track_available": len(track) > 0,
        "track": [{"lat": t.latitude, "lon": t.longitude, "t": t.timestamp} for t in track],
        "frame_list": [
            {
                "id": f.id,
                "seq": f.frame_seq,
                "ping_number": f.ping_number,
                "timestamp": f.timestamp,
                "quality_score": f.quality_score,
                "motion_available": f.motion_available,
                "image_url": media_url(f.image_path),
                "overlay_url": media_url(f.overlay_path),
                "shadow_url": media_url(f.shadow_path),
            }
            for f in frames
        ],
    }


@router.get("/frames/latest")
def latest_frame(db: Session = Depends(get_db)):
    f = db.query(SonarFrame).order_by(SonarFrame.created_at.desc()).first()
    if not f:
        return {"frame": None, "message": "No frames ingested"}
    from app.models import SonarMetadata

    m = db.query(SonarMetadata).filter(SonarMetadata.frame_id == f.id).first()
    return {
        "frame": {
            "id": f.id,
            "survey_id": f.survey_id,
            "seq": f.frame_seq,
            "ping_number": f.ping_number,
            "timestamp": f.timestamp,
            "quality_score": f.quality_score,
            "completeness": f.completeness,
            "motion_available": f.motion_available,
            "artefact_flags": f.artefact_flags,
            "image_url": media_url(f.image_path),
            "overlay_url": media_url(f.overlay_path),
            "shadow_url": media_url(f.shadow_path),
            "latitude": m.latitude if m else None,
            "longitude": m.longitude if m else None,
            "heading": m.heading if m else None,
            "depth": m.depth if m else None,
            "altitude": m.altitude if m else None,
            "range_m": m.range_m if m else None,
            "gps_available": m.gps_available if m else False,
            "motion_compensation": m.motion_compensation if m else "unavailable",
        }
    }


@router.post("/surveys/upload")
async def upload_survey(
    file: UploadFile = File(...),
    metadata: str = Form("{}"),
    name: str = Form(""),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    if len(raw) > MAX:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")
    if not file.filename:
        raise HTTPException(400, "Filename required")
    suf = Path(file.filename).suffix.lower()
    try:
        extra = json.loads(metadata or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "metadata must be JSON") from exc
    if not isinstance(extra, dict):
        extra = {}
    survey = Survey(
        name=name or Path(file.filename).stem,
        source_type="upload",
        source_name=file.filename,
        status="queued",
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    dest = STORAGE / survey.id
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / file.filename
    path.write_bytes(raw)
    # sidecar next to upload
    extra = {**load_sidecar_metadata(path), **extra}

    def _run() -> None:
        session = SessionLocal()
        try:
            process_upload(session, survey.id, path, extra)
        except Exception:
            pass
        finally:
            session.close()

    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, "survey_id": survey.id, "status": "queued", "filename": file.filename, "format": suf}
