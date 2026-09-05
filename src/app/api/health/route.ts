export async function GET() {
  const ML = process.env.ML_API_URL ?? "http://127.0.0.1:8765";
  try {
    const res = await fetch(`${ML}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json(
      {
        ok: false,
        hosted: true,
        error: "The website is live. The YOLO detector is not running on Vercel.",
      },
      { status: 200 },
    );
  }
}
