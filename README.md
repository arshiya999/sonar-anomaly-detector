# Aqua Vision

**Side-Scan Sonar Intelligence** for Smart India Hackathon 2026 problem **SIH26057**  
Ministry of Earth Sciences (MoES) · National Institute of Ocean Technology (NIOT)

Operator console (navy sidebar, light cards, OSM map) is a **Next.js** app. YOLO inference, PostgreSQL, and the ops API are wired behind it. Each ping is inferred as soon as it is uploaded. Map coordinates come only from JPEG EXIF, operator-entered survey origin, or optional live device GPS. Missing GPS leaves contacts **unmapped** — the console does not invent a city.

## Run locally

```bash
# PostgreSQL 16 — database aqua_vision, user aqua / aqua
sudo pg_ctlcluster 16 main start   # or docker compose up db -d

python3 -m pip install -r ml/requirements.txt -r backend/requirements.txt
npm install
npm run dev:all
```

Open http://127.0.0.1:47281 on this machine.

## Open from any phone or laptop

The dashboard is a normal HTTPS website. Anyone can use it if they have the public URL — they do **not** type `127.0.0.1` on their own device.

While this project is running with a Cloudflare tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:47281 --protocol http2 --edge-ip-version 4
```

That prints a link like `https://….trycloudflare.com`. Open that on a phone, tablet, or any PC (Chrome, Safari, Firefox). YOLO stays on the server; the phone only talks to the website.

For a machine that stays online (college lab / VPS):

```bash
docker compose up --build -d
# then put nginx or cloudflared in front of port 47281
```

`dev:all` starts:

| Service | Port |
| --- | --- |
| Next.js operator dashboard | 47281 |
| YOLO inference (`ml/server.py`) | 8765 |
| Ops API + PostgreSQL (`backend/`) | 8766 |

Seed the database with the reference SCTD / ARIS frames (YOLO + sidecar GPS):

```bash
npm run seed:surveys
```

That writes **real** surveys and detections into Postgres. The dashboard loads them from `GET /api/log` (`source: postgres`). Overlay JPEGs are served at `/media/...` via a rewrite to the ops API.

## Environment

Copy `.env.example`:

| Variable | Meaning |
| --- | --- |
| `OPS_API_URL` | Ops API, default `http://127.0.0.1:8766` |
| `ML_API_URL` | YOLO API, default `http://127.0.0.1:8765` |
| `DATABASE_URL` | `postgresql+psycopg://aqua:aqua@127.0.0.1:5432/aqua_vision` |
| `MODEL_PATH` | YOLO `.pt` (default `ml/weights/sonar-debris-yolo11n.pt`) |
| `STORAGE_DIR` | Overlay / frame JPEG storage |
| `CORS_ORIGINS` | Operator UI origins |
| `MAX_UPLOAD_MB` | Upload cap (default 64) |

## Deploy: Vercel (frontend) + Render (ML + ops)

The Next.js operator UI goes on **Vercel**. YOLO (`ml/server.py`) and the ops API (`backend/`) stay on **Render**. Vercel never runs the `.pt` weights.

1. Push this repo to GitHub (`arshiya999/sonar-anomaly-detector`).
2. In [vercel.com/new](https://vercel.com/new) import that repo. Framework: **Next.js**. Root directory: `.` (not `frontend/`).
3. Before the first production deploy, add **Environment Variables** (Production):

| Name | Value |
| --- | --- |
| `ML_API_URL` | Render URL of the detector, e.g. `https://aqua-vision-ml.onrender.com` (no trailing slash) |
| `OPS_API_URL` | Render URL of the ops API, e.g. `https://aqua-vision-api.onrender.com` |

4. Deploy. The site proxies `/api/detect` → Render ML, `/api/log` and `/media` → Render ops.
5. On Render, set `CORS_ORIGINS` to your Vercel URL (or keep `*` if that is already allowed).
6. First upload after Render sleep can take ~30–50s. Wait, then retry.

Or click **Publish** in Cursor if that pill is shown — then paste the same two env vars in the Vercel project **Settings → Environment Variables** and redeploy.

## Production (Docker)

```bash
docker compose up --build
```

- `web` — Next.js on **47281**
- `ml` — YOLO on **8765**
- `api` — FastAPI + media on **8766**
- `db` — PostgreSQL 16

After first boot, seed from a host that can reach the containers:

```bash
python3 scripts/seed_reference_surveys.py http://127.0.0.1:8765 http://127.0.0.1:8766
```

## Project layout

```
src/                    Next.js operator UI (this is the website)
src/app/api/            Proxies: /api/detect → YOLO, /api/log → Postgres
backend/app/           Ops FastAPI, SQLAlchemy, ingest, reports, WebSockets
ml/                     Training + sonar-debris-yolo11n.pt + inference server
public/samples/         SCTD / ARIS rasters + .meta.json ping sidecars
frontend/               Optional Vite SIH console (do not bind 47281 while Next is running)
```

## Honesty rules

- Upload without latitude/longitude → detections stay **unmapped** (`GPS unavailable`).
- Model offline → dashboard **Offline**, inference refused.
- Class names come from the loaded Ultralytics weights: ghost_net, debris, shipwreck, aircraft, propeller, tire, cylinder, diver.

## Tests

```bash
npm run test:ml
npm run test:api
```
