import { NextRequest } from "next/server";
import { mlApiUrl } from "@/lib/upstream";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ML = mlApiUrl();
  try {
    const form = await req.formData();
    const res = await fetch(`${ML}/detect`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      {
        error:
          "Cannot reach the YOLO service. On Vercel, set ML_API_URL to your Render detector URL (no trailing slash).",
      },
      { status: 503 },
    );
  }
}
