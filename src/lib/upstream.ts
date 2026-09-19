/** Render (prod) or local FastAPI. Trim trailing slashes so we never double-slash paths. */
export function mlApiUrl(): string {
  return (process.env.ML_API_URL ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
}

export function opsApiUrl(): string {
  return (process.env.OPS_API_URL ?? "http://127.0.0.1:8766").replace(/\/+$/, "");
}
