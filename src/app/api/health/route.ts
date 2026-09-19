import { mlApiUrl } from "@/lib/upstream";

export const maxDuration = 30;

export async function GET() {
  const ML = mlApiUrl();
  try {
    const res = await fetch(`${ML}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json();
    return Response.json({ ...data, ml: ML });
  } catch {
    return Response.json(
      {
        ok: false,
        hosted: Boolean(process.env.VERCEL),
        ml: ML,
        error: process.env.VERCEL
          ? "The Vercel site is live. Set ML_API_URL to the Render detector, then retry (Render free tier may be waking up)."
          : "Inference service is not running on port 8765.",
      },
      { status: 200 },
    );
  }
}
