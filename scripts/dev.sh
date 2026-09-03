#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
export PORT="${PORT:-47281}"
export ML_PORT="${ML_PORT:-8765}"

python3 -m uvicorn --app-dir "$ROOT/ml" server:app --host 0.0.0.0 --port "$ML_PORT" &
ML_PID=$!
trap 'kill $ML_PID 2>/dev/null || true' EXIT

cd "$ROOT"
npx next dev --hostname 0.0.0.0 --port "$PORT"
