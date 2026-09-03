#!/usr/bin/env python3
"""Convert public sonar datasets into Ultralytics YOLO detection format."""

from __future__ import annotations

import json
import random
import shutil
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import yaml

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
YOLO_DIR = ROOT / "data" / "yolo"
RAW = ROOT / "raw"

CLASS_ORDER = [
    "ghost_net",
    "debris",
    "shipwreck",
    "aircraft",
    "propeller",
    "tire",
    "cylinder",
    "diver",
]
CLASS_TO_ID = {n: i for i, n in enumerate(CLASS_ORDER)}

SOURCE_MAP = {
    "chain": "ghost_net",
    "hook": "ghost_net",
    "bottle": "debris",
    "can": "debris",
    "drink-carton": "debris",
    "shampoo-bottle": "debris",
    "standing-bottle": "debris",
    "ship": "shipwreck",
    "aircraft": "aircraft",
    "airplane": "aircraft",
    "propeller": "propeller",
    "tire": "tire",
    "valve": "cylinder",
    "human": "diver",
}


def xyxy_to_yolo(xmin, ymin, xmax, ymax, w, h) -> str | None:
    xmin, ymin = max(0, xmin), max(0, ymin)
    xmax, ymax = min(w, xmax), min(h, ymax)
    bw, bh = xmax - xmin, ymax - ymin
    if bw < 2 or bh < 2:
        return None
    cx, cy = (xmin + xmax) / 2 / w, (ymin + ymax) / 2 / h
    return f"{cx:.6f} {cy:.6f} {bw / w:.6f} {bh / h:.6f}"


def write_pair(split: str, stem: str, image_path: Path, lines: list[str]) -> None:
    img_out = YOLO_DIR / "images" / split / f"{stem}{image_path.suffix.lower()}"
    lbl_out = YOLO_DIR / "labels" / split / f"{stem}.txt"
    shutil.copy2(image_path, img_out)
    lbl_out.write_text("\n".join(lines) + "\n")


def collect_sctd(rng: random.Random) -> list[tuple]:
    img_dir = RAW / "sctd_extracted" / "SCTD" / "JPEGImages"
    ann_dir = RAW / "sctd_extracted" / "SCTD" / "Annotations"
    items = []
    for xml_path in sorted(ann_dir.glob("*.xml")):
        root = ET.parse(xml_path).getroot()
        filename = root.findtext("filename")
        img = img_dir / filename
        if not img.exists():
            continue
        size = root.find("size")
        w, h = int(size.findtext("width")), int(size.findtext("height"))
        lines = []
        for obj in root.findall("object"):
            src = obj.findtext("name")
            dest = SOURCE_MAP.get(src)
            if dest is None:
                continue
            box = obj.find("bndbox")
            yolo = xyxy_to_yolo(
                int(box.findtext("xmin")),
                int(box.findtext("ymin")),
                int(box.findtext("xmax")),
                int(box.findtext("ymax")),
                w,
                h,
            )
            if yolo:
                lines.append(f"{CLASS_TO_ID[dest]} {yolo}")
        if lines:
            items.append(("sctd_" + xml_path.stem, img, lines))
    rng.shuffle(items)
    return items


def collect_watertank(rng: random.Random, per_class: int = 55) -> list[tuple]:
    base = RAW / "watertank" / "marine-debris-watertank-release" / "fls-images"
    ann = json.loads((base / "annotations.json").read_text())
    by_class: dict[str, list] = defaultdict(list)
    for fname, payload in ann.items():
        img = base / fname
        if not img.exists():
            continue
        im = cv2.imread(str(img), cv2.IMREAD_GRAYSCALE)
        if im is None:
            continue
        h, w = im.shape
        lines = []
        classes_in_image = set()
        for b in payload.get("bounding-boxes", []):
            dest = SOURCE_MAP.get(b["class"])
            if dest is None:
                continue
            xmin, ymin = int(b["top-left-x"]), int(b["top-left-y"])
            xmax, ymax = xmin + int(b["width"]), ymin + int(b["height"])
            yolo = xyxy_to_yolo(xmin, ymin, xmax, ymax, w, h)
            if yolo:
                lines.append(f"{CLASS_TO_ID[dest]} {yolo}")
                classes_in_image.add(dest)
        if lines:
            primary = next(iter(classes_in_image))
            by_class[primary].append(("wt_" + img.stem, img, lines))

    items = []
    for cls, rows in by_class.items():
        rng.shuffle(rows)
        take = rows[:per_class]
        items.extend(take)
        print(f"  watertank {cls}: kept {len(take)} / {len(rows)}")
    rng.shuffle(items)
    return items


def collect_seabed_weak(rng: random.Random, limit: int = 80) -> list[tuple]:
    """Weak boxes for SeabedObjects crops (object typically fills the frame)."""
    items = []
    plane_dir = RAW / "seabed_extracted" / "plane-real"
    if plane_dir.exists():
        for img in list(plane_dir.glob("*"))[:40]:
            if img.suffix.lower() not in {".png", ".jpg", ".jpeg", ".bmp"}:
                continue
            im = cv2.imread(str(img))
            if im is None:
                continue
            h, w = im.shape[:2]
            # inset 8% — classification crops
            yolo = xyxy_to_yolo(int(0.08 * w), int(0.08 * h), int(0.92 * w), int(0.92 * h), w, h)
            if yolo:
                items.append((f"sb_plane_{img.stem}", img, [f"{CLASS_TO_ID['aircraft']} {yolo}"]))

    ships = [
        p
        for p in (RAW / "seabed_extracted").glob("*")
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg"}
    ]
    rng.shuffle(ships)
    for img in ships[:limit]:
        im = cv2.imread(str(img))
        if im is None:
            continue
        h, w = im.shape[:2]
        yolo = xyxy_to_yolo(int(0.08 * w), int(0.08 * h), int(0.92 * w), int(0.92 * h), w, h)
        if yolo:
            items.append((f"sb_ship_{img.stem}", img, [f"{CLASS_TO_ID['shipwreck']} {yolo}"]))
    return items


def export_samples(all_items: list[tuple]) -> None:
    sample_dir = REPO / "public" / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)
    # Prefer diverse SCTD + watertank examples
    chosen = []
    seen = set()
    for stem, img, lines in all_items:
        cls = int(lines[0].split()[0])
        key = (stem.split("_")[0], cls)
        if key in seen:
            continue
        seen.add(key)
        chosen.append((stem, img, cls))
        if len(chosen) >= 12:
            break
    manifest = []
    # NIOT / Bay of Bengal survey track (illustrative geotags)
    base_lat, base_lon = 13.0827, 80.3708
    for i, (stem, img, cls) in enumerate(chosen):
        dest = sample_dir / f"{stem}{img.suffix.lower()}"
        shutil.copy2(img, dest)
        meta = {
            "image": dest.name,
            "sensor": "side-scan-sonar",
            "platform": "AUV-demo",
            "latitude": round(base_lat + i * 0.0012, 6),
            "longitude": round(base_lon + i * 0.0018, 6),
            "heading_deg": 42.0 + i * 3,
            "meters_per_pixel_x": 0.08,
            "meters_per_pixel_y": 0.05,
            "nadir_pixel_x": None,
            "survey": "NIOT Bay of Bengal demo transect",
        }
        (sample_dir / f"{stem}.meta.json").write_text(json.dumps(meta, indent=2))
        manifest.append({"file": dest.name, "meta": f"{stem}.meta.json", "example_class": CLASS_ORDER[cls]})
    (sample_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Exported {len(chosen)} demo samples to {sample_dir}")


def main() -> None:
    rng = random.Random(42)
    for split in ("train", "val"):
        (YOLO_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (YOLO_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)
        for p in (YOLO_DIR / "images" / split).glob("*"):
            p.unlink()
        for p in (YOLO_DIR / "labels" / split).glob("*"):
            p.unlink()

    print("Collecting SCTD (real SSS/SAS, VOC boxes)...")
    sctd = collect_sctd(rng)
    print(f"  {len(sctd)} images")
    print("Collecting marine-debris watertank (FLS, JSON boxes)...")
    wt = collect_watertank(rng, per_class=50)
    print(f"  {len(wt)} images")
    print("Collecting SeabedObjects weak boxes...")
    sb = collect_seabed_weak(rng)
    print(f"  {len(sb)} images")

    items = sctd + wt + sb
    rng.shuffle(items)
    n_val = max(40, int(0.18 * len(items)))
    val, train = items[:n_val], items[n_val:]

    counts = Counter()
    for split, subset in (("train", train), ("val", val)):
        for stem, img, lines in subset:
            write_pair(split, stem, img, lines)
            for line in lines:
                counts[CLASS_ORDER[int(line.split()[0])]] += 1
        print(f"{split}: {len(subset)} images")

    data_yaml = {
        "path": str(YOLO_DIR),
        "train": "images/train",
        "val": "images/val",
        "names": {i: n for i, n in enumerate(CLASS_ORDER)},
    }
    yaml_path = YOLO_DIR / "data.yaml"
    yaml_path.write_text(yaml.safe_dump(data_yaml, sort_keys=False))
    print("class instance counts:", dict(counts))
    print("wrote", yaml_path)
    export_samples(sctd + wt)


if __name__ == "__main__":
    main()
