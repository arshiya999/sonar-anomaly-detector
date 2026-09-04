#!/usr/bin/env python3
"""Run real SCTD / FLS sonar rasters through YOLO and store results in PostgreSQL."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "public" / "samples"
ML = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
OPS = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:8766"


def post_detect(image: Path, meta: dict) -> dict:
    boundary = "----AquaBoundary"
    body = b""

    def field(name: str, value: bytes, filename: str | None = None, ctype: str | None = None) -> bytes:
        hdr = f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"".encode()
        if filename:
            hdr += f"; filename=\"{filename}\"".encode()
        hdr += b"\r\n"
        if ctype:
            hdr += f"Content-Type: {ctype}\r\n".encode()
        hdr += b"\r\n"
        return hdr + value + b"\r\n"

    img = image.read_bytes()
    ctype = "image/jpeg" if image.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    body += field("image", img, image.name, ctype)
    body += field("metadata", json.dumps(meta).encode(), None, "application/json")
    body += field("conf_threshold", b"0.22")
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{ML}/detect",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode())


def ingest(filename: str, payload: dict) -> dict:
    data = json.dumps(
        {
            "filename": filename,
            "report": payload.get("report") or {},
            "overlay_jpeg_base64": payload.get("overlay_jpeg_base64"),
        }
    ).encode()
    req = urllib.request.Request(
        f"{OPS}/api/ingest/ml-report",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode())


def main() -> None:
    files = sorted([*SAMPLES.glob("*.jpg"), *SAMPLES.glob("*.png")])
    if not files:
        raise SystemExit("No sample rasters in public/samples")
    for image in files:
        meta_path = image.with_suffix(".meta.json")
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        print(f"infer {image.name} …", flush=True)
        result = post_detect(image, meta)
        if result.get("error"):
            print("  skip:", result["error"])
            continue
        stored = ingest(image.name, result)
        n = (result.get("report") or {}).get("count", 0)
        print(f"  {n} detections → survey {stored.get('survey_id')} deduped={stored.get('deduped')}")


if __name__ == "__main__":
    main()
