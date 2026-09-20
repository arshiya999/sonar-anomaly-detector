/** Browser calls Render directly so Vercel’s 10s function limit does not cut YOLO. */
export const PUBLIC_ML_URL = (process.env.NEXT_PUBLIC_ML_API_URL ?? "").replace(/\/+$/, "");
export const PUBLIC_OPS_URL = (process.env.NEXT_PUBLIC_OPS_API_URL ?? "").replace(/\/+$/, "");
