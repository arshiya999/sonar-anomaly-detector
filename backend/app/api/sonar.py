from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Survey
from app.schemas import ConnectRequest
from app.services.live_manager import live_manager

router = APIRouter()


@router.get("/sonar/status")
def sonar_status():
    return live_manager.status()


@router.post("/sonar/connect")
def sonar_connect(body: ConnectRequest, db: Session = Depends(get_db)):
    survey = Survey(
        name=body.survey_name or f"Live {datetime.utcnow().isoformat(timespec='seconds')}Z",
        source_type="live",
        source_name=body.path or f"{body.host}:{body.port}",
        status="running",
        started_at=datetime.utcnow(),
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    try:
        live_manager.connect(body.source_type, body.host, body.port, body.path, survey.id)
    except Exception as exc:  # noqa: BLE001
        survey.status = "failed"
        survey.error = str(exc)
        db.commit()
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "survey_id": survey.id, "status": live_manager.status()}


@router.post("/sonar/disconnect")
def sonar_disconnect(db: Session = Depends(get_db)):
    sid = live_manager.survey_id
    live_manager.disconnect()
    if sid:
        s = db.get(Survey, sid)
        if s and s.status == "running":
            s.status = "stopped"
            s.ended_at = datetime.utcnow()
            db.commit()
    return {"ok": True, "status": live_manager.status()}


@router.post("/surveys/start")
def start_live(db: Session = Depends(get_db)):
    if not live_manager.source:
        raise HTTPException(400, "Sonar disconnected")
    live_manager.paused = False
    if live_manager.survey_id:
        s = db.get(Survey, live_manager.survey_id)
        if s:
            s.status = "running"
            db.commit()
    return live_manager.status()


@router.post("/surveys/stop")
def stop_live(db: Session = Depends(get_db)):
    return sonar_disconnect(db)


@router.post("/sonar/pause")
def pause():
    if not live_manager.source:
        raise HTTPException(400, "Sonar disconnected")
    live_manager.paused = True
    return live_manager.status()


@router.post("/sonar/resume")
def resume():
    if not live_manager.source:
        raise HTTPException(400, "Sonar disconnected")
    live_manager.paused = False
    return live_manager.status()
