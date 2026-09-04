"""Live adapters: TCP JSON-line frames, or a directory of arriving raster files."""

from __future__ import annotations

import json
import socket
import threading
import time
from collections.abc import Callable
from pathlib import Path

from app.ingest.base import SonarFrame
from app.ingest.raster import RasterSonarReader, decode_image_bytes


class LiveSonarSource:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.connected = False
        self.detail = "Sonar disconnected"
        self.last_error: str | None = None

    def disconnect(self) -> None:
        self._stop.set()
        self.connected = False
        self.detail = "Sonar disconnected"

    def is_connected(self) -> bool:
        return self.connected

    def describe(self) -> str:
        return self.detail


class DirectoryLiveSource(LiveSonarSource):
    """Watches a folder for new PNG/JPG/TIF files written by a towed-fish logger."""

    def __init__(self, path: Path, on_frame: Callable[[SonarFrame], None]) -> None:
        super().__init__()
        self.path = Path(path)
        self.on_frame = on_frame

    def connect(self) -> None:
        if not self.path.is_dir():
            raise FileNotFoundError(f"Live directory not found: {self.path}")
        self._stop.clear()
        self.connected = True
        self.detail = f"directory:{self.path}"
        seen = {p.name for p in self.path.iterdir() if p.is_file()}
        self._thread = threading.Thread(target=self._loop, args=(seen,), daemon=True)
        self._thread.start()

    def _loop(self, seen: set[str]) -> None:
        while not self._stop.is_set():
            try:
                for p in sorted(self.path.iterdir()):
                    if not p.is_file() or p.name in seen:
                        continue
                    if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
                        continue
                    seen.add(p.name)
                    try:
                        frames = RasterSonarReader(p).read_frames()
                        for fr in frames:
                            self.on_frame(fr)
                    except Exception as exc:  # noqa: BLE001
                        self.last_error = str(exc)
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
            time.sleep(0.4)


class TcpLiveSource(LiveSonarSource):
    """
    Line protocol: one JSON object per line.
    {"image_b64": "...jpeg...", "latitude": ..., "longitude": ..., "ping_number": ...}
    or {"path": "/incoming/frame.png"}
    """

    def __init__(self, host: str, port: int, on_frame: Callable[[SonarFrame], None]) -> None:
        super().__init__()
        self.host = host
        self.port = port
        self.on_frame = on_frame

    def connect(self) -> None:
        self._stop.clear()
        self.connected = False
        self.detail = f"tcp:{self.host}:{self.port}"
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self) -> None:
        import base64

        while not self._stop.is_set():
            try:
                with socket.create_connection((self.host, self.port), timeout=5) as sock:
                    self.connected = True
                    sock.settimeout(1.0)
                    buf = b""
                    while not self._stop.is_set():
                        try:
                            chunk = sock.recv(65536)
                        except TimeoutError:
                            continue
                        if not chunk:
                            break
                        buf += chunk
                        while b"\n" in buf:
                            line, buf = buf.split(b"\n", 1)
                            if not line.strip():
                                continue
                            msg = json.loads(line.decode("utf-8"))
                            if msg.get("path"):
                                frames = RasterSonarReader(Path(msg["path"]), extra_meta=msg).read_frames()
                            elif msg.get("image_b64"):
                                img = decode_image_bytes(base64.b64decode(msg["image_b64"]))
                                frames = [
                                    SonarFrame(
                                        frame_id=str(msg.get("frame_id", "live")),
                                        survey_id="",
                                        image=img,
                                        latitude=msg.get("latitude"),
                                        longitude=msg.get("longitude"),
                                        heading=msg.get("heading"),
                                        depth=msg.get("depth"),
                                        altitude=msg.get("altitude"),
                                        ping_number=msg.get("ping_number"),
                                        metadata=msg,
                                    )
                                ]
                            else:
                                continue
                            for fr in frames:
                                self.on_frame(fr)
            except Exception as exc:  # noqa: BLE001
                self.connected = False
                self.last_error = str(exc)
                time.sleep(1.5)
        self.connected = False
