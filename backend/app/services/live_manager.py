from __future__ import annotations

from pathlib import Path

from app.database import SessionLocal
from app.ingest.live import DirectoryLiveSource, LiveSonarSource, TcpLiveSource
from app.models import Survey
from app.services.processor import load_runtime, process_sonar_frame


class LiveManager:
    def __init__(self) -> None:
        self.source: LiveSonarSource | None = None
        self.survey_id: str | None = None
        self.paused = False
        self.seq = 0
        self.last_frame: dict | None = None
        self.fps: float | None = None

    def status(self) -> dict:
        connected = bool(self.source and self.source.is_connected())
        return {
            "connected": connected,
            "state": "connected" if connected and not self.paused else ("paused" if self.paused and connected else "disconnected"),
            "detail": self.source.describe() if self.source else "Sonar disconnected",
            "survey_id": self.survey_id,
            "error": getattr(self.source, "last_error", None) if self.source else None,
            "fps": self.fps,
            "last_frame": self.last_frame,
        }

    def connect(self, source_type: str, host: str | None, port: int | None, path: str | None, survey_id: str) -> None:
        self.disconnect()
        self.survey_id = survey_id
        self.paused = False
        self.seq = 0
        if source_type == "tcp":
            if not host or not port:
                raise ValueError("TCP live sonar requires host and port")
            src = TcpLiveSource(host, int(port), self._on_frame)
        elif source_type == "directory":
            if not path:
                raise ValueError("Directory live sonar requires path")
            src = DirectoryLiveSource(Path(path), self._on_frame)
        else:
            raise ValueError("Unknown live source type")
        src.connect()
        self.source = src

    def disconnect(self) -> None:
        if self.source:
            self.source.disconnect()
        self.source = None
        self.survey_id = None
        self.paused = False
        self.last_frame = None

    def _on_frame(self, frame) -> None:
        if self.paused or not self.survey_id:
            return
        db = SessionLocal()
        try:
            survey = db.get(Survey, self.survey_id)
            if not survey or survey.status in {"stopped", "failed"}:
                return
            runtime = load_runtime(db)
            process_sonar_frame(db, survey, frame, self.seq, runtime)
            self.seq += 1
            self.last_frame = {
                "seq": self.seq,
                "ping_number": frame.ping_number,
                "latitude": frame.latitude,
                "longitude": frame.longitude,
            }
        finally:
            db.close()


live_manager = LiveManager()
