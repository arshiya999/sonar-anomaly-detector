/** Browser can call Render YOLO directly (CORS is open) and skip Vercel’s short serverless timeout. */
export const PUBLIC_ML_URL = (process.env.NEXT_PUBLIC_ML_API_URL ?? "").replace(/\/+$/, "");
