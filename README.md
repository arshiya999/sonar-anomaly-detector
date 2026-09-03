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

## Share a website link (anyone’s phone or laptop)

`127.0.0.1` only works on the computer that is running ABYSS. To send **one HTTPS link** (judges, WhatsApp, etc.):

1. Click **Create repo** so this project is on GitHub.
2. Open [Render](https://render.com) (free account) → **New** → **Blueprint** → connect that GitHub repo. It uses `render.yaml` + `Dockerfile` (dashboard and detector in one service).
3. Wait for the first build (PyTorch, several minutes). Render gives a URL like `https://abyss.onrender.com`.
4. Send that URL. Free instances sleep after idle; the first click can take a minute to wake.

Same idea on [Railway](https://railway.app) or [Fly.io](https://fly.io): deploy the root `Dockerfile`, set `PORT` as the public port, keep `ML_API_URL=http://127.0.0.1:8765`.

This cannot be a static Vercel site by itself — the YOLO detector is Python and must run next to the web app.

## Run on your own computer

Two processes must be up: the **Next.js dashboard** (port **47281**) and the **Python detector** (port **8765**). Trained weights ship in `ml/weights/`.

### Option A — Docker (same commands on Windows, macOS, Linux)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). In the project folder:

```bash
docker compose up --build
```

First build downloads PyTorch (several minutes). Then open **http://127.0.0.1:47281** on that computer.

To reach it from another device on the same Wi-Fi, use `http://<that-computer-LAN-IP>:47281` (example: `http://192.168.1.24:47281`). Stop with `Ctrl+C`, then `docker compose down`.

### Option B — Python + Node (no Docker)

1. Get the code: **Create repo** in the agent view if you still have no GitHub repo, then clone or **Download ZIP**.
2. Install [Python 3.11+](https://www.python.org/downloads/) (Windows: tick **Add python.exe to PATH**) and [Node.js 20+](https://nodejs.org/).
3. In the project folder:

**Windows (PowerShell)**

```powershell
python -m pip install -r ml/requirements.txt
npm install
npm run dev:all
```

If `python` is missing: `py -m pip install -r ml/requirements.txt` then `$env:PYTHON="py"; npm run dev:all`

**macOS / Linux**

```bash
python3 -m pip install -r ml/requirements.txt
npm install
npm run dev:all
```

4. Browser: **http://127.0.0.1:47281**

PyTorch via Ultralytics can take several minutes the first time. The dashboard proxies detection to `http://127.0.0.1:8765` (`ML_API_URL` if you change it).

### Production-style (Node build + Python API)

```bash
python3 -m pip install -r ml/requirements.txt
npm install
npm run build
# terminal 1
python3 -m uvicorn --app-dir ml server:app --host 0.0.0.0 --port 8765
# terminal 2
npm start
```

### Train on the public datasets

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
