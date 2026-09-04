"""Klein / Edgetech JSF packet reader (sync 0x1601, message 80 sidescan)."""

from __future__ import annotations

import struct
from pathlib import Path

import numpy as np

from app.ingest.base import SonarFrame
from app.ingest.xtf import samples_to_image

JSF_SYNC = 0x1601
MSG_SIDESCAN = 80


class JSFReader:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._ok = False

    def connect(self) -> None:
        raw = self.path.read_bytes()[:2]
        if struct.unpack("<H", raw)[0] != JSF_SYNC:
            raise ValueError("Not a JSF file (missing 0x1601 sync)")
        self._ok = True

    def disconnect(self) -> None:
        self._ok = False

    def is_connected(self) -> bool:
        return self._ok

    def describe(self) -> str:
        return f"jsf:{self.path.name}"

    def read_frames(self) -> list[SonarFrame]:
        data = self.path.read_bytes()
        offset = 0
        rows: list[np.ndarray] = []
        while offset + 16 <= len(data):
            sync = struct.unpack_from("<H", data, offset)[0]
            if sync != JSF_SYNC:
                offset += 1
                continue
            msg = struct.unpack_from("<H", data, offset + 4)[0]
            size = struct.unpack_from("<I", data, offset + 8)[0]
            header = 16
            end = offset + header + size
            if size <= 0 or end > len(data):
                break
            if msg == MSG_SIDESCAN:
                payload = data[offset + header : end]
                if len(payload) >= 64:
                    n = (len(payload) - 64) // 2
                    if n > 8:
                        samples = np.frombuffer(payload[64 : 64 + n * 2], dtype="<u2")
                        rows.append(samples)
            offset = end
        if not rows:
            raise ValueError("JSF contained no sidescan (message 80) samples")
        img = samples_to_image(rows[:800])
        self._ok = True
        return [
            SonarFrame(
                frame_id="0",
                survey_id="",
                image=img,
                channel="jsf",
                metadata={"jsf_pings": len(rows), "source_file": self.path.name},
            )
        ]
