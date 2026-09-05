import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const ML = process.env.ML_API_URL ?? "http://127.0.0.1:8765";
  try {
    const form = await req.formData();
    const res = await fetch(`${ML}/detect`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      {
        error:
          "This Vercel site is the operator UI. YOLO inference is not deployed here, so uploads cannot be scored until ML_API_URL points at a running detector.",
      },
      { status: 503 },
    );
  }
}
