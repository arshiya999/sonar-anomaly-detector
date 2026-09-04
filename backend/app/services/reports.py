from __future__ import annotations

import csv
import io
import json
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Detection, DetectionValidation, Report, SonarFrame, Survey


def build_report_payload(db: Session, report: Report) -> dict:
    survey = db.get(Survey, report.survey_id)
    dets = db.query(Detection).filter(Detection.survey_id == report.survey_id).all()
    frames = db.query(SonarFrame).filter(SonarFrame.survey_id == report.survey_id).count()
    rows = []
    for d in dets:
        val = db.query(DetectionValidation).filter(DetectionValidation.detection_id == d.id).first()
        rows.append(
            {
                "detection_id": d.id,
                "classification": d.class_name,
                "raw_confidence": d.raw_confidence,
                "final_confidence": d.final_confidence,
                "validation_status": d.validation_status,
                "risk_level": d.risk_level,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "gps": "unavailable" if d.latitude is None or d.longitude is None else "available",
                "timestamp": d.timestamp.isoformat() if d.timestamp else None,
                "bounding_px": {"x": d.x, "y": d.y, "width": d.width, "height": d.height},
                "bounding_m": {"width_m": d.width_m, "length_m": d.length_m},
                "depth": d.depth,
                "frame_id": d.frame_id,
                "ping_number": d.ping_number,
                "validation_reason": val.reason if val else None,
            }
        )
    return {
        "report_id": report.id,
        "survey_id": report.survey_id,
        "survey_name": survey.name if survey else None,
        "survey_time": survey.started_at.isoformat() if survey and survey.started_at else None,
        "sonar_source": survey.source_name if survey else None,
        "frames_processed": frames,
        "total_detections": len(rows),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "detections": rows,
    }


def report_csv(payload: dict) -> str:
    buf = io.StringIO()
    fields = [
        "detection_id",
        "classification",
        "raw_confidence",
        "final_confidence",
        "validation_status",
        "risk_level",
        "latitude",
        "longitude",
        "timestamp",
        "depth",
        "frame_id",
        "ping_number",
        "width_px",
        "height_px",
        "width_m",
        "length_m",
    ]
    w = csv.DictWriter(buf, fieldnames=fields)
    w.writeheader()
    for d in payload["detections"]:
        w.writerow(
            {
                "detection_id": d["detection_id"],
                "classification": d["classification"],
                "raw_confidence": d["raw_confidence"],
                "final_confidence": d["final_confidence"],
                "validation_status": d["validation_status"],
                "risk_level": d["risk_level"],
                "latitude": d["latitude"] if d["latitude"] is not None else "",
                "longitude": d["longitude"] if d["longitude"] is not None else "",
                "timestamp": d["timestamp"] or "",
                "depth": d["depth"] if d["depth"] is not None else "",
                "frame_id": d["frame_id"],
                "ping_number": d["ping_number"] if d["ping_number"] is not None else "",
                "width_px": d["bounding_px"]["width"],
                "height_px": d["bounding_px"]["height"],
                "width_m": d["bounding_m"]["width_m"] if d["bounding_m"]["width_m"] is not None else "",
                "length_m": d["bounding_m"]["length_m"] if d["bounding_m"]["length_m"] is not None else "",
            }
        )
    return buf.getvalue()


def report_json(payload: dict) -> str:
    return json.dumps(payload, indent=2)
