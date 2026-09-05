#!/usr/bin/env bash
# Publish the running Next.js dashboard (port 47281) on a public HTTPS URL.
set -euo pipefail
BIN="${CLOUDFLARED:-/tmp/cloudflared}"
if [[ ! -x "$BIN" ]]; then
  BIN="$(command -v cloudflared || true)"
fi
if [[ -z "$BIN" ]]; then
  echo "cloudflared not found" >&2
  exit 1
fi
exec "$BIN" tunnel --url http://127.0.0.1:47281 --no-autoupdate --protocol http2 --edge-ip-version 4
