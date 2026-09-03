# ABYSS — Automated Benthic Yield Sonar Scanner

End-to-end detector for **MoES / NIOT problem statement 26057**: ingest side-scan (and FLS) sonar imagery, separate man-made debris from seafloor clutter, and emit geotagged JSON/CSV reports for cleanup operations.

The model is trained on **real public sonar imagery**, not placeholders:

| Source | Sensor | Labels | Role |
| --- | --- | --- | --- |
| [SCTD 1.0](https://github.com/MingqiangNing/SCTD) | Side-scan / SAS / FLS | VOC boxes: ship, aircraft, human | Wrecks and divers |
| [Marine Debris FLS watertank](https://github.com/mvaldenegro/marine-debris-fls-datasets) | ARIS Explorer 3000 FLS | JSON boxes | Ghost gear analog (chain/hook), bottles, tires, propellers, valves |
| [SeabedObjects-KLSG](https://github.com/huoguanying/SeabedObjects-Ship-and-Airplane-dataset) | Real SSS crops | Weak full-frame boxes | Extra wreck/aircraft appearance |

Taxonomy used at inference: `ghost_net`, `debris`, `shipwreck`, `aircraft`, `propeller`, `tire`, `cylinder`, `diver`.

## What ships

1. **Pre-process** — dropout inpaint, Lee speckle filter, CLAHE.
2. **YOLO11n detector** — ~2.6M params, CPU / edge friendly, ONNX export after training.
3. **Confidence fusion** — YOLO score × local contrast × acoustic-shadow penalty (rejects long dark streaks from rocks/shadows).
4. **Geotag engine** — pixel → lat/lon from ping header fields (origin, heading, metres/pixel).
5. **Dashboard** — upload a waterfall, overlay boxes, map pins (stay on zoom), charts, and an image intake log.

## Open it on your laptop

This app does **not** appear automatically on your PC. `127.0.0.1` in the cloud session is a different computer. Run it locally:

1. In the Cursor agent view, click **Create repo** so the project exists on GitHub (this started as a new project without a repository).
2. On your laptop, install [Python 3.11+](https://www.python.org/downloads/) (tick **Add Python to PATH**) and [Node.js 20+](https://nodejs.org/).
3. Clone, install, start:

```bash
git clone <YOUR_REPO_URL>
cd <YOUR_REPO_FOLDER>
python -m pip install -r ml/requirements.txt
npm install
npm run dev:all
```

4. Open Chrome/Edge and go to **http://127.0.0.1:47281**

You should see the ABYSS dashboard. Click a sonar thumbnail on the left to run the trained model.

Windows PowerShell uses the same commands (`python` and `npm`). First-time pip install of PyTorch/Ultralytics can take several minutes.

If `python` is not found, try `py -m pip install -r ml/requirements.txt` then set `PYTHON=py` before `npm run dev:all`.

## Run locally (macOS / Linux)

```bash
python3 -m pip install -r ml/requirements.txt
npm install
npm run dev:all
```

Open [http://127.0.0.1:47281](http://127.0.0.1:47281). The inference API listens on port **8765**.

If weights are missing, the API falls back to COCO-pretrained YOLO11n until you train.

## Train on the public datasets

```bash
# downloads are expected under ml/raw (see prepare_dataset.py)
python3 ml/prepare_dataset.py
python3 ml/train.py --epochs 12 --imgsz 320 --batch 8
```

Weights are written to `ml/weights/sonar-debris-yolo11n.pt` (and `.onnx` when export succeeds).

CPU training of YOLO11n at 320 px (12 epochs) reached **mAP50 0.75** / **mAP50-95 0.46** on the held-out sonar val split. The same nano checkpoint can ride on an AUV without a GPU.

## Tests

```bash
python3 -m unittest discover -s ml/tests -v
```

## API

`POST /detect` (multipart)

- `image` — sonar PNG/JPEG
- `metadata` — JSON ping header: `latitude`, `longitude`, `heading_deg`, `meters_per_pixel_x`, `meters_per_pixel_y`, `survey`
- `conf_threshold` — fused confidence 0–1

Response: detections with class, fused confidence 0–100, bounding box, metres, lat/lon, plus a JPEG overlay.

## Disclaimer

Sample coordinates default to a **Bay of Bengal demo transect** near NIOT unless you paste real ping headers. Dataset licenses remain with the original authors; cite SCTD, Valdenegro-Toro marine-debris FLS, and SeabedObjects if you publish results.
