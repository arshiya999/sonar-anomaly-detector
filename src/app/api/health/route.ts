import { mlApiUrl } from "@/lib/upstream";

export const maxDuration = 15;

export async function GET() {
  const ML = mlApiUrl();
  const hosted = Boolean(process.env.VERCEL);
  const waitMs = hosted ? 4000 : 12_000;
  try {
    const res = await fetch(`${ML}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(waitMs),
    });
    const data = await res.json();
    return Response.json({ ...data, hosted, ml: ML });
  } catch {
    return Response.json(
      {
        ok: false,
        hosted,
        ml: ML,
        error: hosted
          ? "Website is up. The detector is waking on Render — wait and retry the upload."
          : "Inference service is not running on port 8765.",
      },
      { status: 200 },
    );
  }
}
