const ML = process.env.ML_API_URL ?? "http://127.0.0.1:8765";

export async function GET() {
  try {
    const res = await fetch(`${ML}/health`, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json(
      { ok: false, error: "Inference service is not running on port 8765." },
      { status: 503 },
    );
  }
}
