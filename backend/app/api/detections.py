from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Detection, DetectionValidation, OperatorReview, SonarFrame, Survey
from app.schemas import ReviewRequest, gps_label
from app.services.processor import media_url

router = APIRouter()


def _pack(db: Session, d: Detection) -> dict:
    frame = db.get(SonarFrame, d.frame_id)
    val = db.query(DetectionValidation).filter(DetectionValidation.detection_id == d.id).first()
    rev = (
        db.query(OperatorReview)
        .filter(OperatorReview.detection_id == d.id)
        .order_by(OperatorReview.created_at.desc())
        .first()
    )
    return {
        "id": d.id,
        "survey_id": d.survey_id,
        "frame_id": d.frame_id,
        "class_name": d.class_name,
        "raw_confidence": d.raw_confidence,
        "final_confidence": d.final_confidence,
        "validation_status": d.validation_status,
        "risk_level": d.risk_level,
        "x": d.x,
        "y": d.y,
        "width": d.width,
        "height": d.height,
        "width_m": d.width_m,
        "length_m": d.length_m,
        "latitude": d.latitude,
        "longitude": d.longitude,
        "gps_label": gps_label(d.latitude, d.longitude),
        "timestamp": d.timestamp,
        "depth": d.depth,
        "heading": d.heading,
        "ping_number": d.ping_number,
        "created_at": d.created_at,
        "image_url": media_url(frame.image_path) if frame else None,
        "overlay_url": media_url(frame.overlay_path) if frame else None,
        "shadow_url": media_url(frame.shadow_path) if frame else None,
        "validation_reason": val.reason if val else None,
        "features": val.features if val else None,
        "operator_decision": rev.decision if rev else None,
        "survey_name": (db.get(Survey, d.survey_id).name if db.get(Survey, d.survey_id) else None),
    }


@router.get("/detections")
def list_detections(
    class_name: str | None = None,
    risk: str | None = None,
    validation: str | None = None,
    survey_id: str | None = None,
    min_conf: float | None = None,
    max_conf: float | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Detection)
    if class_name:
        q = q.filter(Detection.class_name == class_name)
    if risk:
        q = q.filter(Detection.risk_level == risk)
    if validation:
        q = q.filter(Detection.validation_status == validation)
    if survey_id:
        q = q.filter(Detection.survey_id == survey_id)
    if min_conf is not None:
        q = q.filter(Detection.final_confidence >= min_conf)
    if max_conf is not None:
        q = q.filter(Detection.final_confidence <= max_conf)
    rows = q.order_by(Detection.created_at.desc()).limit(500).all()
    return [_pack(db, d) for d in rows]


@router.get("/detections/map")
def map_detections(db: Session = Depends(get_db)):
    rows = (
        db.query(Detection)
        .filter(Detection.latitude.is_not(None), Detection.longitude.is_not(None))
        .order_by(Detection.created_at.desc())
        .limit(2000)
        .all()
    )
    return [
        {
            "id": d.id,
            "class_name": d.class_name,
            "final_confidence": d.final_confidence,
            "latitude": d.latitude,
            "longitude": d.longitude,
            "timestamp": d.timestamp,
            "survey_id": d.survey_id,
            "validation_status": d.validation_status,
        }
        for d in rows
    ]


@router.get("/detections/stats")
def stats(db: Session = Depends(get_db)):
    rows = db.query(Detection).all()
    by_class: dict[str, int] = {}
    bands = {"low": 0, "medium": 0, "high": 0}
    for d in rows:
        by_class[d.class_name] = by_class.get(d.class_name, 0) + 1
        if d.final_confidence > 80:
            bands["high"] += 1
        elif d.final_confidence >= 50:
            bands["medium"] += 1
        else:
            bands["low"] += 1
    latest = db.query(Detection).order_by(Detection.created_at.desc()).first()
    return {
        "total": len(rows),
        "by_class": [{"class": k, "count": v} for k, v in sorted(by_class.items(), key=lambda x: -x[1])],
        "confidence": bands,
        "latest": _pack(db, latest) if latest else None,
    }


@router.get("/detections/{detection_id}")
def get_detection(detection_id: str, db: Session = Depends(get_db)):
    d = db.get(Detection, detection_id)
    if not d:
        raise HTTPException(404, "Detection not found")
    return _pack(db, d)


@router.post("/detections/{detection_id}/review")
def review(detection_id: str, body: ReviewRequest, db: Session = Depends(get_db)):
    d = db.get(Detection, detection_id)
    if not d:
        raise HTTPException(404, "Detection not found")
    db.add(OperatorReview(detection_id=d.id, decision=body.decision, note=body.note))
    db.commit()
    return _pack(db, d)
