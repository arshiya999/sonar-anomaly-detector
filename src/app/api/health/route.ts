import { mlApiUrl, opsApiUrl } from "@/lib/upstream";
import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function pingJson(url: string, ms: number): Promise<{ ok: boolean; status?: number; body?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    let body: Record<string, unknown> | undefined;
    try {
      const parsed = (await res.json()) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") body = parsed;
    } catch {
      body = undefined;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const ML = (PUBLIC_ML_URL || mlApiUrl()).replace(/\/+$/, "");
  const OPS = (PUBLIC_OPS_URL || opsApiUrl()).replace(/\/+$/, "");
  const hosted = Boolean(process.env.VERCEL);
  const waitMs = hosted ? 25_000 : 8_000;

  const [ml, ops] = await Promise.all([
    pingJson(`${ML}/health`, waitMs),
    pingJson(`${OPS}/health`, waitMs),
  ]);

  const weights = typeof ml.body?.weights === "string" ? ml.body.weights : undefined;
  const allUp = ml.ok && ops.ok;

  return Response.json({
    ok: allUp,
    hosted,
    trained: Boolean(ml.body?.trained ?? ml.ok),
    weights,
    ml: ML,
    ops: OPS,
    links: {
      frontend: { ok: true, url: process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://sonar-anomaly-detector.vercel.app" },
      ml: { ok: ml.ok, url: ML, status: ml.status },
      ops: { ok: ops.ok, url: OPS, status: ops.status },
    },
    error: allUp
      ? undefined
      : !ml.ok && !ops.ok
        ? "Render ML and ops are waking — wait ~30s and retry."
        : !ml.ok
          ? "ML detector is waking on Render — wait and retry Analyze."
          : "Ops API is waking on Render — wait and retry Analyze.",
  });
}
