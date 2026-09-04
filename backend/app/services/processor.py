from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import cv2
from sqlalchemy.orm import Session

from app.config import STORAGE
from app.hub import hub
from app.ingest.jsf import JSFReader
from app.ingest.raster import RasterSonarReader
from app.ingest.xtf import XTFReader
from app.models import (
    Alert,
    Detection,
    DetectionValidation,
    GpsTrack,
    ModelRun,
    Report,
    RuntimeSettings,
    SonarFrame,
    SonarMetadata,
    Survey,
)
from app.pipeline.annotate import annotate
from app.pipeline.geotag import box_dimensions_m, pixel_to_latlon
from app.pipeline.infer import get_model, model_status, run_inference
from app.pipeline.preprocess import PreprocessConfig, acoustic_shadow_map, overlay_shadow, prepare_for_detector, to_gray
from app.pipeline.quality import assess_frame
from app.pipeline.validate import validate_detection
from app.schemas import DEFAULT_SETTINGS

log = logging.getLogger("aqua.processor")


def media_url(path: str | None) -> str | None:
    if not path:
        return None
    name = Path(path).name
    survey = Path(path).parent.name
    return f"/media/{survey}/{name}"


def load_runtime(db: Session) -> dict:
    row = db.get(RuntimeSettings, 1)
    if not row:
        row = RuntimeSettings(id=1, payload=DEFAULT_SETTINGS)
        db.add(row)
        db.commit()
        db.refresh(row)
    return {**DEFAULT_SETTINGS, **(row.payload or {})}


def save_image(survey_id: str, name: str, image) -> str:
    d = STORAGE / survey_id
    d.mkdir(parents=True, exist_ok=True)
    path = d / name
    cv2.imwrite(str(path), image)
    return str(path)


def open_reader(path: Path, extra_meta: dict | None = None):
    suf = path.suffix.lower()
    if suf in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
        return RasterSonarReader(path, extra_meta=extra_meta)
    if suf == ".xtf":
        return XTFReader(path)
    if suf == ".jsf":
        return JSFReader(path)
    raise ValueError(f"Unsupported format {suf}. Supported: PNG, JPEG, TIFF, XTF, JSF (+ JSON/CSV sidecars).")


def process_sonar_frame(db: Session, survey: Survey, frame, seq: int, runtime: dict) -> None:
    cfg = PreprocessConfig(
        lee_size=int(runtime.get("lee_size", 5)),
        clahe_clip=float(runtime.get("clahe_clip", 2.4)),
        use_lee=bool(runtime.get("use_lee", True)),
        use_clahe=bool(runtime.get("use_clahe", True)),
        inpaint_dropouts=bool(runtime.get("inpaint_dropouts", True)),
    )
    meta = dict(frame.metadata or {})
    if frame.latitude is not None:
        meta["latitude"] = frame.latitude
    if frame.longitude is not None:
        meta["longitude"] = frame.longitude
    if frame.heading is not None:
        meta["heading_deg"] = frame.heading
        meta["heading"] = frame.heading
    if frame.depth is not None:
        meta["depth"] = frame.depth
    if frame.altitude is not None:
        meta["altitude"] = frame.altitude
    if frame.resolution[0] is not None:
        meta["meters_per_pixel_x"] = frame.resolution[0]
    if frame.resolution[1] is not None:
        meta["meters_per_pixel_y"] = frame.resolution[1]

    quality = assess_frame(frame.image, meta)
    raw_path = save_image(survey.id, f"frame_{seq:05d}.jpg", frame.image)
    gray = to_gray(frame.image)
    shadow = acoustic_shadow_map(gray)
    shadow_vis = overlay_shadow(frame.image if frame.image.ndim == 3 else cv2.cvtColor(frame.image, cv2.COLOR_GRAY2BGR), shadow)
    shadow_path = save_image(survey.id, f"shadow_{seq:05d}.jpg", shadow_vis)

    prepared = prepare_for_detector(frame.image, cfg)
    inf = run_inference(
        prepared,
        conf=float(runtime.get("conf_threshold", 0.22)),
        iou=float(runtime.get("nms_threshold", 0.45)),
        model_path=runtime.get("model_path"),
    )
    if not inf["ok"]:
        raise RuntimeError(inf["error"] or "AI model not loaded")

    h, w = gray.shape[:2]
    kept: list[dict] = []
    for i, box in enumerate(inf["boxes"]):
        val = validate_detection(
            box["confidence"],
            gray,
            box["xyxy"],
            box["class_name"],
            shadow_filter=bool(runtime.get("shadow_filter", True)),
        )
        if val["validation_status"] == "REJECTED":
            # persist rejected for operator audit
            pass
        x1, y1, x2, y2 = box["xyxy"]
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        lat, lon = pixel_to_latlon(cx, cy, w, h, meta)
        dims = box_dimensions_m(box["xyxy"], meta)
        mask = inf["masks"][i] if i < len(inf["masks"]) else None
        kept.append(
            {
                "class_name": box["class_name"],
                "x": x1,
                "y": y1,
                "width": x2 - x1,
                "height": y2 - y1,
                "width_m": dims["width_m"],
                "length_m": dims["length_m"],
                "latitude": lat,
                "longitude": lon,
                "mask": mask,
                **val,
            }
        )

    overlay = annotate(frame.image, kept)
    overlay_path = save_image(survey.id, f"overlay_{seq:05d}.jpg", overlay)

    gps_ok = frame.latitude is not None and frame.longitude is not None
    sf = SonarFrame(
        survey_id=survey.id,
        frame_seq=seq,
        ping_number=frame.ping_number,
        timestamp=frame.timestamp,
        image_path=raw_path,
        overlay_path=overlay_path,
        shadow_path=shadow_path,
        channel=frame.channel,
        quality_score=quality["quality_score"],
        completeness=quality["completeness"],
        motion_available=quality["motion_available"],
        artefact_flags=quality["flags"],
        inference_ms=None,
    )
    db.add(sf)
    db.flush()
    db.add(
        SonarMetadata(
            frame_id=sf.id,
            latitude=frame.latitude,
            longitude=frame.longitude,
            heading=frame.heading,
            depth=frame.depth,
            altitude=frame.altitude,
            range_m=frame.range_m,
            resolution_x=frame.resolution[0],
            resolution_y=frame.resolution[1],
            gps_available=gps_ok,
            motion_compensation=quality["flags"]["motion_compensation"],
            extra=meta,
        )
    )
    if gps_ok:
        n = db.query(GpsTrack).filter(GpsTrack.survey_id == survey.id).count()
        db.add(
            GpsTrack(
                survey_id=survey.id,
                seq=n,
                latitude=frame.latitude,
                longitude=frame.longitude,
                timestamp=frame.timestamp,
                heading=frame.heading,
            )
        )

    new_alerts = 0
    for det in kept:
        row = Detection(
            survey_id=survey.id,
            frame_id=sf.id,
            class_name=det["class_name"],
            raw_confidence=det["raw_confidence"],
            final_confidence=det["final_confidence"],
            validation_status=det["validation_status"],
            risk_level=det["risk_level"],
            x=det["x"],
            y=det["y"],
            width=det["width"],
            height=det["height"],
            width_m=det["width_m"],
            length_m=det["length_m"],
            latitude=det["latitude"],
            longitude=det["longitude"],
            timestamp=frame.timestamp,
            depth=frame.depth,
            heading=frame.heading,
            ping_number=frame.ping_number,
        )
        db.add(row)
        db.flush()
        db.add(
            DetectionValidation(
                detection_id=row.id,
                raw_confidence=det["raw_confidence"],
                final_confidence=det["final_confidence"],
                validation_status=det["validation_status"],
                risk_level=det["risk_level"],
                reason=det["reason"],
                features=det["features"],
            )
        )
        if det["final_confidence"] > 80 and det["validation_status"] != "REJECTED":
            gps = "GPS unavailable"
            if det["latitude"] is not None and det["longitude"] is not None:
                gps = f"{det['latitude']:.6f}, {det['longitude']:.6f}"
            alert = Alert(
                survey_id=survey.id,
                detection_id=row.id,
                title="HIGH CONFIDENCE ANOMALY",
                body=f"{det['class_name']} · {det['final_confidence']:.0f}% · {gps}",
            )
            db.add(alert)
            new_alerts += 1
            db.flush()
            _broadcast(
                "alerts",
                {
                    "type": "alert",
                    "id": alert.id,
                    "title": alert.title,
                    "body": alert.body,
                    "class_name": det["class_name"],
                    "confidence": det["final_confidence"],
                    "latitude": det["latitude"],
                    "longitude": det["longitude"],
                    "timestamp": frame.timestamp.isoformat() if frame.timestamp else None,
                },
            )
        _broadcast(
            "detections",
            {
                "type": "detection",
                "id": row.id,
                "survey_id": survey.id,
                "class_name": row.class_name,
                "final_confidence": row.final_confidence,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "validation_status": row.validation_status,
                "risk_level": row.risk_level,
            },
        )

    survey.frames_count = (survey.frames_count or 0) + 1
    survey.detections_count = (survey.detections_count or 0) + len(kept)
    survey.alerts_count = (survey.alerts_count or 0) + new_alerts
    db.commit()
    _broadcast(
        "sonar",
        {
            "type": "frame",
            "survey_id": survey.id,
            "frame_id": sf.id,
            "seq": seq,
            "ping_number": frame.ping_number,
            "timestamp": frame.timestamp.isoformat() if frame.timestamp else None,
            "latitude": frame.latitude,
            "longitude": frame.longitude,
            "depth": frame.depth,
            "altitude": frame.altitude,
            "heading": frame.heading,
            "quality_score": quality["quality_score"],
            "motion_compensation": quality["flags"]["motion_compensation"],
            "image_url": media_url(raw_path),
            "overlay_url": media_url(overlay_path),
            "shadow_url": media_url(shadow_path),
            "detections": len(kept),
        },
    )


def _broadcast(room: str, payload: dict) -> None:
    from app.hub import emit

    emit(room, payload)


def process_upload(db: Session, survey_id: str, file_path: Path, extra_meta: dict | None = None) -> Survey:
    survey = db.get(Survey, survey_id)
    if not survey:
        raise ValueError("Survey not found")
    runtime = load_runtime(db)
    st = model_status()
    if not st["exists"]:
        survey.status = "failed"
        survey.error = "AI model not loaded"
        db.commit()
        raise RuntimeError("AI model not loaded")
    get_model(runtime.get("model_path"))
    survey.status = "running"
    survey.started_at = datetime.utcnow()
    survey.model_name = Path(st["path"]).name
    db.commit()
    run = ModelRun(
        survey_id=survey.id,
        model_path=st["path"],
        device=st.get("device") or "cpu",
        task=st.get("task") or "detect",
        conf_threshold=float(runtime["conf_threshold"]),
        nms_threshold=float(runtime["nms_threshold"]),
    )
    db.add(run)
    db.commit()
    try:
        reader = open_reader(file_path, extra_meta)
        reader.connect()
        frames = reader.read_frames()
        for i, fr in enumerate(frames):
            fr.survey_id = survey.id
            process_sonar_frame(db, survey, fr, i, runtime)
        survey.status = "completed"
        survey.ended_at = datetime.utcnow()
        run.finished_at = datetime.utcnow()
        run.frames = survey.frames_count
        run.detections = survey.detections_count
        db.add(Report(survey_id=survey.id))
        db.commit()
    except Exception as exc:  # noqa: BLE001
        survey.status = "failed"
        survey.error = str(exc)
        survey.ended_at = datetime.utcnow()
        db.commit()
        raise
    return survey
