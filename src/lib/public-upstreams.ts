/** Browser calls Render directly so Vercel’s 10s function limit does not cut YOLO. */

const PROD_ML = "https://aquavision-ml-h8vr.onrender.com";
const PROD_OPS = "https://aquavision-backend-5g8u.onrender.com";

function onVercel(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL);
}

export const PUBLIC_ML_URL = (
  process.env.NEXT_PUBLIC_ML_API_URL || (onVercel() ? PROD_ML : "")
).replace(/\/+$/, "");

export const PUBLIC_OPS_URL = (
  process.env.NEXT_PUBLIC_OPS_API_URL || (onVercel() ? PROD_OPS : "")
).replace(/\/+$/, "");
