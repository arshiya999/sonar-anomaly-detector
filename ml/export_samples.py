#!/usr/bin/env python3
"""Copy a few extra labelled frames into public/samples if the gallery is thin."""
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
samples = ROOT / "public" / "samples"
samples.mkdir(parents=True, exist_ok=True)
print("samples", len(list(samples.glob("*.jpg"))) + len(list(samples.glob("*.png"))))
print(json.loads((samples / "manifest.json").read_text()) if (samples / "manifest.json").exists() else "no manifest")
