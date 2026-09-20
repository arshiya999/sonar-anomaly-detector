import { mlApiUrl, opsApiUrl } from "@/lib/upstream";
import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

async function ping(url: string, ms: number): Promise<{ url: string; ok: boolean; status?: number }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return { url, ok: res.ok, status: res.status };
  } catch {
    return { url, ok: false };
  }
}

/** Vercel Cron + GitHub Actions hit this so Render does not sleep while this Cloud VM is off. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const ml = (PUBLIC_ML_URL || mlApiUrl()).replace(/\/+$/, "");
  const ops = (PUBLIC_OPS_URL || opsApiUrl()).replace(/\/+$/, "");

  const results = await Promise.all([
    ping(`${ml}/health`, 8000),
    ping(`${ops}/api/system/status`, 8000),
    ping(`${ops}/health`, 5000),
  ]);

  return Response.json({
    ok: results.some((r) => r.ok),
    until: "2026-12-31",
    results,
  });
}
