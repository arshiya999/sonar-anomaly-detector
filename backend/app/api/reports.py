from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Report, Survey
from app.services.reports import build_report_payload, report_csv, report_json

router = APIRouter()


def _latest_or_id(db: Session, report_id: str) -> Report:
    if report_id == "latest":
        r = db.query(Report).order_by(Report.created_at.desc()).first()
        if not r:
            raise HTTPException(404, "No reports yet")
        return r
    r = db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    return r


@router.get("/reports")
def list_reports(db: Session = Depends(get_db)):
    rows = db.query(Report).order_by(Report.created_at.desc()).all()
    out = []
    for r in rows:
        s = db.get(Survey, r.survey_id)
        out.append(
            {
                "id": r.id,
                "survey_id": r.survey_id,
                "survey_name": s.name if s else None,
                "created_at": r.created_at,
                "detections": s.detections_count if s else 0,
                "frames": s.frames_count if s else 0,
            }
        )
    return out


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    r = _latest_or_id(db, report_id)
    return build_report_payload(db, r)


@router.get("/reports/{report_id}/json")
def get_report_json(report_id: str, db: Session = Depends(get_db)):
    r = _latest_or_id(db, report_id)
    payload = build_report_payload(db, r)
    return Response(report_json(payload), media_type="application/json")


@router.get("/reports/{report_id}/csv")
def get_report_csv(report_id: str, db: Session = Depends(get_db)):
    r = _latest_or_id(db, report_id)
    payload = build_report_payload(db, r)
    return Response(report_csv(payload), media_type="text/csv")
