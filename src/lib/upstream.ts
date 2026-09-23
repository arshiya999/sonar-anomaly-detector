/** Render (prod) or local FastAPI. Trim trailing slashes so we never double-slash paths. */

const PROD_ML = "https://aquavision-ml-h8vr.onrender.com";
const PROD_OPS = "https://aquavision-backend-5g8u.onrender.com";

export function mlApiUrl(): string {
  const fromEnv = (process.env.ML_API_URL ?? "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) return PROD_ML;
  return "http://127.0.0.1:8765";
}

export function opsApiUrl(): string {
  const fromEnv = (process.env.OPS_API_URL ?? "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL) return PROD_OPS;
  return "http://127.0.0.1:8766";
}
