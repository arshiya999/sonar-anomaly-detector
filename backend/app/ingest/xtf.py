"""eXtended Triton Format (XTF) ping reader — Triton FileFormat byte 123, packet magic 0xFACE."""

from __future__ import annotations

import struct
from datetime import datetime
from pathlib import Path

import numpy as np

from app.ingest.base import SonarFrame

XTF_MAGIC = 0xFACE
SONAR_PING = 0


def _u16(b: bytes, o: int) -> int:
    return struct.unpack_from("<H", b, o)[0]


def _u32(b: bytes, o: int) -> int:
    return struct.unpack_from("<I", b, o)[0]


def _f32(b: bytes, o: int) -> float:
    return struct.unpack_from("<f", b, o)[0]


def _f64(b: bytes, o: int) -> float:
    return struct.unpack_from("<d", b, o)[0]


def samples_to_image(rows: list[np.ndarray]) -> np.ndarray:
    width = max(r.size for r in rows)
    img = np.zeros((len(rows), width), dtype=np.uint8)
    for i, row in enumerate(rows):
        if row.dtype != np.uint8:
            rmin, rmax = float(row.min()), float(row.max())
            if rmax <= rmin:
                scaled = np.zeros_like(row, dtype=np.uint8)
            else:
                scaled = ((row.astype(np.float32) - rmin) / (rmax - rmin) * 255.0).astype(np.uint8)
        else:
            scaled = row
        img[i, : scaled.size] = scaled[:width]
    return np.repeat(img[:, :, None], 3, axis=2)


class XTFReader:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._ok = False

    def connect(self) -> None:
        raw = self.path.read_bytes()
        if len(raw) < 1024 or raw[0] != 123:
            raise ValueError("Not a valid XTF file (FileFormat 123 missing)")
        self._ok = True

    def disconnect(self) -> None:
        self._ok = False

    def is_connected(self) -> bool:
        return self._ok

    def describe(self) -> str:
        return f"xtf:{self.path.name}"

    def read_frames(self) -> list[SonarFrame]:
        data = self.path.read_bytes()
        if len(data) < 1024 or data[0] != 123:
            raise ValueError("Not a valid XTF file")
        offset = 1024
        pings: list[dict] = []
        while offset + 14 <= len(data):
            magic = _u16(data, offset)
            if magic != XTF_MAGIC:
                offset += 1
                continue
            header_type = data[offset + 2]
            num_bytes = _u32(data, offset + 10)
            if num_bytes < 64 or offset + num_bytes > len(data):
                break
            packet = data[offset : offset + num_bytes]
            if header_type == SONAR_PING:
                parsed = self._parse_ping(packet)
                if parsed:
                    pings.append(parsed)
            offset += num_bytes
        if not pings:
            raise ValueError("XTF contained no sonar ping packets")
        # Stack into waterfalls of up to 400 pings (one frame each)
        frames: list[SonarFrame] = []
        chunk = 400
        for i in range(0, len(pings), chunk):
            group = pings[i : i + chunk]
            img = samples_to_image([p["samples"] for p in group])
            first = group[0]
            frames.append(
                SonarFrame(
                    frame_id=str(i // chunk),
                    survey_id="",
                    image=img,
                    timestamp=first["timestamp"],
                    latitude=first["lat"],
                    longitude=first["lon"],
                    heading=first["heading"],
                    depth=first["depth"],
                    altitude=first["altitude"],
                    ping_number=first["ping"],
                    channel="xtf",
                    metadata={"xtf_pings": len(group), "source_file": self.path.name},
                )
            )
        self._ok = True
        return frames

    def _parse_ping(self, packet: bytes) -> dict | None:
        if len(packet) < 256:
            return None
        year = _u16(packet, 14)
        month, day, hour, minute, second = packet[16], packet[17], packet[18], packet[19], packet[20]
        ping = _u32(packet, 40) if len(packet) >= 44 else None
        # Common Triton layout: SensorYcoordinate (lat) and SensorXcoordinate (lon) as doubles
        lat = lon = heading = depth = alt = None
        try:
            # Offsets vary by XTF revision; try well-known Rev 19-ish ping header
            heading = float(_f32(packet, 76))
            if heading == 0:
                heading = None
            depth = float(_f32(packet, 80))
            alt = float(_f32(packet, 84))
            lat = float(_f64(packet, 96))
            lon = float(_f64(packet, 104))
        except struct.error:
            pass
        if lat is not None and (abs(lat) > 90 or abs(lon or 0) > 180 or (lat == 0 and lon == 0)):
            lat, lon = None, None
        if depth == 0:
            depth = None
        if alt == 0:
            alt = None
        ts = None
        if 1970 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
            try:
                ts = datetime(year, month, day, hour % 24, minute % 60, second % 60)
            except ValueError:
                ts = None
        # Remaining bytes after a 256-byte ping header are typically 16-bit samples
        payload = packet[256:]
        if len(payload) < 16:
            return None
        n = len(payload) // 2
        samples = np.frombuffer(payload[: n * 2], dtype="<u2")
        return {
            "samples": samples,
            "timestamp": ts,
            "lat": lat,
            "lon": lon,
            "heading": heading,
            "depth": depth,
            "altitude": alt,
            "ping": ping,
        }
