import { opsApiUrl } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const safe = path.filter((p) => p && p !== ".." && !p.includes("/"));
  if (!safe.length) {
    return new Response("Not found", { status: 404 });
  }
  const url = `${opsApiUrl()}/media/${safe.map(encodeURIComponent).join("/")}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      return new Response("Media not found", { status: res.status });
    }
    const type = res.headers.get("content-type") ?? "application/octet-stream";
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Ops storage is unreachable", { status: 502 });
  }
}
