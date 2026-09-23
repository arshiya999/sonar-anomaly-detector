import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";
import type { DetectReport } from "@/lib/types";
import { compressFrame } from "@/lib/compress-frame";

export type BatchDetectItem = {
  filename: string;
  report: DetectReport | null;
  error?: string;
};

function mlHost(): string {
  return (PUBLIC_ML_URL || "").replace(/\/+$/, "");
}

function opsHost(): string {
  return (PUBLIC_OPS_URL || "").replace(/\/+$/, "");
}

async function postBatch(
  host: string,
  blobs: { filename: string; blob: Blob }[],
  conf: number,
  ms: number,
): Promise<{ filename?: string; report?: DetectReport }[] | null> {
  if (!host || ms < 800) return null;
  const form = new FormData();
  form.append("conf_threshold", String(conf));
  form.append("metadata", JSON.stringify({ sensor: "side-scan-sonar" }));
  for (const item of blobs) form.append("images", item.blob, item.filename);
  try {
    const res = await fetch(`${host}/detect-batch`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { filename?: string; report?: DetectReport }[] };
    return Array.isArray(data.results) && data.results.length ? data.results : null;
  } catch {
    return null;
  }
}

/** One batched YOLO call. No per-image fallback — that was the 2-minute stall. */
export async function detectFolder(
  files: { file: File; filename: string }[],
  conf: number,
  onChunk?: (done: number, total: number, current: string) => void,
): Promise<BatchDetectItem[]> {
  const n = files.length;
  const budget = n >= 70 ? 50_000 : 16_000;
  const started = Date.now();
  const remain = () => Math.max(1200, budget - (Date.now() - started));
  const gate = Math.min(Math.max(conf, 0.12), 0.2);

  onChunk?.(0, n, "Preparing frames");
  void fetch(`${mlHost()}/health`, { cache: "no-store" }).catch(() => undefined);

  const blobs = await Promise.all(
    files.map(async (item) => ({
      filename: item.filename,
      blob: await compressFrame(item.file, 256, 0.55),
    })),
  );

  onChunk?.(Math.min(2, n), n, "Scoring sonar");
  let hits = await postBatch(mlHost(), blobs, gate, remain());
  if (!hits) hits = await postBatch(opsHost(), blobs, gate, Math.min(remain(), n >= 70 ? 25_000 : 8_000));

  onChunk?.(n, n, "");
  return files.map((item, i) => {
    const hit = hits?.find((r) => r.filename === item.filename) ?? hits?.[i];
    return { filename: item.filename, report: hit?.report ?? null };
  });
}
