# Aqua Vision

**Side-Scan Sonar Intelligence** for Smart India Hackathon 2026 problem **SIH26057**  
Ministry of Earth Sciences (MoES) · National Institute of Ocean Technology (NIOT)

End-to-end system: real side-scan imagery/logs enter FastAPI, are preprocessed, inferred with YOLO (detect and/or segment depending on weights), false-positive filtered, geotagged only when GPS exists, stored in PostgreSQL, pushed over WebSockets, and exported as JSON/CSV. The UI never hardcodes detections, coordinates, or “Ready” when the backend is down.

## 1. Project structure

```
backend/app/           FastAPI, SQLAlchemy models, REST + WebSockets
backend/app/ingest/    SonarDataSource adapters (raster, XTF, JSF, live TCP/dir)
backend/app/pipeline/  preprocess, quality, YOLO, validation, geotag
frontend/              Vite + React + TypeScript + Tailwind + Leaflet
ml/                    Training, public-dataset prep, YOLO weights
data/aqua_storage/     Frame images written at runtime
```

## 2. Setup commands

```bash
# PostgreSQL 16, database aqua_vision, user aqua / aqua
sudo pg_ctlcluster 16 main start   # or: docker compose up db

python3 -m pip install -r backend/requirements.txt -r ml/requirements.txt
cd frontend && npm install && cd ..

# API
cd backend && PYTHONPATH=. uvicorn app.main:app --host 0.0.0.0 --port 8765

# UI (proxies /api /ws /media to the API)
cd frontend && npm run dev
```

Open http://127.0.0.1:47281

Docker: `docker compose up --build` (Postgres + API + Vite).

## 3. Environment variables

Copy `.env.example`:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy URL, default `postgresql+psycopg://aqua:aqua@127.0.0.1:5432/aqua_vision` |
| `MODEL_PATH` | YOLO `.pt` or `.onnx` path |
| `STORAGE_DIR` | Frame JPEG storage |
| `CORS_ORIGINS` | Comma-separated UI origins |
| `MAX_UPLOAD_MB` | Upload cap (default 64) |

## 4. Database setup

```bash
sudo -u postgres createuser -P aqua
sudo -u postgres createdb -O aqua aqua_vision
cd backend && PYTHONPATH=. alembic upgrade head
```

Tables are also created on API startup via SQLAlchemy metadata: `surveys`, `sonar_frames`, `sonar_metadata`, `detections`, `detection_validation`, `gps_tracks`, `alerts`, `operator_reviews`, `reports`, `model_runs`, `runtime_settings`.

## 5. Backend setup

`uvicorn app.main:app --host 0.0.0.0 --port 8765` from `backend/` with `PYTHONPATH=.`

REST (prefix `/api`): sonar connect/disconnect/status, surveys start/stop/upload, frames/latest, detections (+ map + review), reports JSON/CSV, model/status, system/status, settings.

WebSockets: `/ws/sonar`, `/ws/detections`, `/ws/alerts`.

## 6. Frontend setup

Vite on port **47281**. Proxies API and sockets so the browser uses one origin.

## 7. AI model setup

Default weights: `ml/weights/sonar-debris-yolo11n.pt` (object detection). Class names are read from the loaded Ultralytics model, not invented.

To train: `python ml/prepare_dataset.py` then `python ml/train.py`. Export ONNX from Ultralytics for edge (`yolo export format=onnx`). If `MODEL_PATH` is missing the UI shows **AI model not loaded** and inference is refused.

Measured validation metrics live in `ml/weights/metrics.json` and are **not** shown as live dashboard KPIs unless you cite that file as a training report.

## 8. Supported sonar formats

| Format | Parser | Notes |
| --- | --- | --- |
| PNG, JPEG, TIFF | `RasterSonarReader` | Optional `.json` / `.csv` sidecar for ping headers |
| XTF | `XTFReader` | Triton FileFormat 123, packet magic `0xFACE`, ping type 0 |
| JSF | `JSFReader` | Sync `0x1601`, sidescan message 80 |
| JSON/CSV | `MetadataReader` | Sidecar only; does not invent GPS |

XTF/JSF header layouts vary by manufacturer revision. If GPS fields are absent or out of range they stay **unavailable**.

## 9. How to connect a real sonar source

**Live TCP** — JSON line protocol, e.g. `{"image_b64":"<jpeg>", "latitude":..., "longitude":..., "ping_number":...}` or `{"path":"/incoming/frame.png"}`. Live Sonar page → host/port → Connect TCP.

**Directory** — a logger writes PNG/JPG/TIF into a folder; each new file is a frame.

**File survey** — Upload Survey for XTF/JSF/raster.

Until a source is connected the live view is **SONAR DISCONNECTED** (no synthetic waterfall).

## 10. SIH26057 requirement-to-feature mapping

| Requirement | Feature |
| --- | --- |
| Ingest SSS | Raster / XTF / JSF / live adapters |
| Automated CV | FastAPI processor thread |
| Man-made debris | YOLO classes from weights + validation |
| Detect + segment | YOLO `task` detect or segment; masks stored when present |
| Shipwreck/pipe/cylinder/nets | Supported if those names exist on the loaded model |
| Natural vs artificial | Contrast, ripple, acoustic-shadow filter |
| Speckle, resolution, shadows, artefacts, dropouts | Lee, resize, shadow map, dropout inpaint |
| Heave/pitch/roll | Quality flags; **Motion compensation unavailable** unless IMU keys exist |
| Confidence 0–100% | `raw_confidence` and `final_confidence` |
| False-positive filter | `pipeline/validate.py` CONFIRMED/LIKELY/UNCERTAIN/REJECTED |
| Ping metadata / lat-lon | Sidecar + XTF/JSF fields; never fabricated |
| Bounding dimensions | Pixels always; metres only with resolution metadata |
| JSON/CSV | `/api/reports/{id}/json` and `/csv` |
| Map | Leaflet OSM, confidence-coloured pins, real GPS track only |
| Dashboard + overlays | Vite UI |
| Real-time | WebSockets + live adapters |
| Edge | CPU YOLO + optional ONNX next to the API (no cloud inference required) |

## 11. Testing

```bash
cd backend && PYTHONPATH=. python3 -m unittest discover -s tests -v
python3 -m unittest discover -s ml/tests -v
cd frontend && npx tsc -b
```

Upload a raster **without** GPS and confirm the UI shows **GPS unavailable**. Disconnect sonar and confirm **SONAR DISCONNECTED**.

## 12. Deployment

- Workstation: PostgreSQL + `uvicorn` + `npm run dev` (or `vite preview` after `npm run build` behind the API).
- Compose: `docker compose up --build`.
- AUV/edge box: run API + model on the vehicle computer; UI on the operator laptop; `MODEL_PATH` to ONNX/PT; no cloud GPU required.

Operator reviews (approve / reject / uncertain) are stored in `operator_reviews`.
