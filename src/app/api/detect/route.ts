import { NextRequest } from "next/server";
import { mlApiUrl } from "@/lib/upstream";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ML = mlApiUrl();
  try {
    const incoming = await req.formData();
    const outgoing = new FormData();
    for (const [key, value] of incoming.entries()) {
      outgoing.append(key, value);
    }
    const res = await fetch(`${ML}/detect`, {
      method: "POST",
      body: outgoing,
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "network error";
    return Response.json(
      {
        error: `Cannot reach YOLO at ${ML} (${detail}). Wake the Render ML service and retry.`,
      },
      { status: 503 },
    );
  }
}
