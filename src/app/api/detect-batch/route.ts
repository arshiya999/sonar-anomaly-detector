import { NextRequest } from "next/server";
import { mlApiUrl, opsApiUrl } from "@/lib/upstream";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const incoming = await req.formData();
  const hosts = [mlApiUrl(), opsApiUrl()].map((h) => h.replace(/\/+$/, ""));
  let last = "Batch detector unreachable";
  for (const host of hosts) {
    try {
      const outgoing = new FormData();
      for (const [key, value] of incoming.entries()) {
        outgoing.append(key, value);
      }
      const res = await fetch(`${host}/detect-batch`, {
        method: "POST",
        body: outgoing,
        signal: AbortSignal.timeout(55_000),
      });
      const data = await res.json();
      if (res.ok) return Response.json(data, { status: res.status });
      last = (data as { error?: string }).error || `${host} ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : last;
    }
  }
  return Response.json({ error: last }, { status: 503 });
}
