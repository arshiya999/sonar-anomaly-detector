from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Alert, Detection, RuntimeSettings, Survey
from app.pipeline.infer import get_model, model_status
from app.schemas import RuntimeSettingsIn
from app.services.live_manager import live_manager
from app.services.processor import load_runtime

router = APIRouter()


def _system(db: Session) -> dict:
    get_model(load_runtime(db).get("model_path"))
    st = model_status()
    live = live_manager.status()
    dets = db.query(func.count(Detection.id)).scalar() or 0
    alerts = db.query(func.count(Alert.id)).filter(Alert.read.is_(False)).scalar() or 0
    high = (
        db.query(func.count(Detection.id))
        .filter(Detection.final_confidence > 80, Detection.validation_status != "REJECTED")
        .scalar()
        or 0
    )
    active = (
        db.query(Survey)
        .filter(Survey.status.in_(["running", "paused"]))
        .order_by(Survey.started_at.desc())
        .first()
    )
    if not st["exists"]:
        system = "error"
        model_label = "not_loaded"
    elif live["state"] == "connected":
        system = "processing" if active and active.status == "running" else "ready"
        model_label = "loaded" if st["loaded"] or st["exists"] else "not_loaded"
    else:
        system = "ready" if st["exists"] else "error"
        model_label = "loaded" if st["exists"] else "not_loaded"
    return {
        "system": system,
        "sonar": live["state"],
        "sonar_detail": live["detail"],
        "model": model_label,
        "model_info": st,
        "total_detections": int(dets),
        "unread_alerts": int(alerts),
        "high_confidence_alerts": int(high),
        "current_survey": None
        if not active
        else {"id": active.id, "name": active.name, "status": active.status, "source": active.source_name},
        "problem": "SIH26057",
        "organization": "Ministry of Earth Sciences (MoES)",
        "department": "National Institute of Ocean Technology (NIOT)",
        "storage": settings.storage_dir,
        "health": "operational" if system != "error" else "degraded",
        "clock": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/system/status")
def system_status(db: Session = Depends(get_db)):
    return _system(db)


@router.get("/model/status")
def model(db: Session = Depends(get_db)):
    get_model(load_runtime(db).get("model_path"))
    runtime = load_runtime(db)
    st = model_status()
    return {**st, "conf_threshold": runtime["conf_threshold"], "nms_threshold": runtime["nms_threshold"]}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return load_runtime(db)


@router.put("/settings")
def put_settings(body: RuntimeSettingsIn, db: Session = Depends(get_db)):
    row = db.get(RuntimeSettings, 1)
    if not row:
        row = RuntimeSettings(id=1, payload=body.model_dump())
        db.add(row)
    else:
        row.payload = body.model_dump()
        row.updated_at = datetime.utcnow()
    db.commit()
    if body.model_path:
        get_model(body.model_path)
    return row.payload


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)):
    rows = db.query(Alert).order_by(Alert.created_at.desc()).limit(100).all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "body": a.body,
            "created_at": a.created_at,
            "read": a.read,
            "survey_id": a.survey_id,
            "detection_id": a.detection_id,
        }
        for a in rows
    ]
