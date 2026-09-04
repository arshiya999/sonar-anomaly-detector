from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base

JsonType = JSON().with_variant(JSONB, "postgresql")


def uid() -> str:
    return uuid.uuid4().hex


class Survey(Base):
    __tablename__ = "surveys"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255))
    source_type: Mapped[str] = mapped_column(String(32))
    source_name: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(32), default="queued")
    frames_count: Mapped[int] = mapped_column(Integer, default=0)
    detections_count: Mapped[int] = mapped_column(Integer, default=0)
    alerts_count: Mapped[int] = mapped_column(Integer, default=0)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    frames = relationship("SonarFrame", back_populates="survey")
    detections = relationship("Detection", back_populates="survey")


class SonarFrame(Base):
    __tablename__ = "sonar_frames"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    frame_seq: Mapped[int] = mapped_column(Integer)
    ping_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    image_path: Mapped[str] = mapped_column(String(1024))
    overlay_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    shadow_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    completeness: Mapped[float | None] = mapped_column(Float, nullable=True)
    motion_available: Mapped[bool] = mapped_column(Boolean, default=False)
    artefact_flags: Mapped[dict] = mapped_column(JsonType, default=dict)
    inference_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    survey = relationship("Survey", back_populates="frames")
    metadata_row = relationship("SonarMetadata", uselist=False, back_populates="frame")


class SonarMetadata(Base):
    __tablename__ = "sonar_metadata"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    frame_id: Mapped[str] = mapped_column(ForeignKey("sonar_frames.id"), unique=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    depth: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    range_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolution_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolution_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_available: Mapped[bool] = mapped_column(Boolean, default=False)
    motion_compensation: Mapped[str] = mapped_column(String(32), default="unavailable")
    extra: Mapped[dict] = mapped_column(JsonType, default=dict)

    frame = relationship("SonarFrame", back_populates="metadata_row")


class Detection(Base):
    __tablename__ = "detections"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    frame_id: Mapped[str] = mapped_column(ForeignKey("sonar_frames.id"), index=True)
    class_name: Mapped[str] = mapped_column(String(64), index=True)
    raw_confidence: Mapped[float] = mapped_column(Float)
    final_confidence: Mapped[float] = mapped_column(Float, index=True)
    validation_status: Mapped[str] = mapped_column(String(16), index=True)
    risk_level: Mapped[str] = mapped_column(String(16), index=True)
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    width_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    length_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    depth: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    ping_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mask_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    survey = relationship("Survey", back_populates="detections")
    validation = relationship("DetectionValidation", uselist=False, back_populates="detection")
    reviews = relationship("OperatorReview", back_populates="detection")


class DetectionValidation(Base):
    __tablename__ = "detection_validation"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    detection_id: Mapped[str] = mapped_column(ForeignKey("detections.id"), unique=True)
    raw_confidence: Mapped[float] = mapped_column(Float)
    final_confidence: Mapped[float] = mapped_column(Float)
    validation_status: Mapped[str] = mapped_column(String(16))
    risk_level: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text, default="")
    features: Mapped[dict] = mapped_column(JsonType, default=dict)

    detection = relationship("Detection", back_populates="validation")


class GpsTrack(Base):
    __tablename__ = "gps_tracks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    detection_id: Mapped[str | None] = mapped_column(ForeignKey("detections.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(128))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class OperatorReview(Base):
    __tablename__ = "operator_reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    detection_id: Mapped[str] = mapped_column(ForeignKey("detections.id"), index=True)
    decision: Mapped[str] = mapped_column(String(16))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    detection = relationship("Detection", back_populates="reviews")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ModelRun(Base):
    __tablename__ = "model_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    survey_id: Mapped[str] = mapped_column(ForeignKey("surveys.id"), index=True)
    model_path: Mapped[str] = mapped_column(String(1024))
    device: Mapped[str] = mapped_column(String(32))
    task: Mapped[str] = mapped_column(String(32), default="detect")
    conf_threshold: Mapped[float] = mapped_column(Float)
    nms_threshold: Mapped[float] = mapped_column(Float)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    frames: Mapped[int] = mapped_column(Integer, default=0)
    detections: Mapped[int] = mapped_column(Integer, default=0)


class RuntimeSettings(Base):
    __tablename__ = "runtime_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    payload: Mapped[dict] = mapped_column(JsonType, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
