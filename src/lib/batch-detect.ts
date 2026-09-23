import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";
import type { DetectReport } from "@/lib/types";
import { compressFrame } from "@/lib/compress-frame";

export type BatchDetectItem = {
  filename: string;
  report: DetectReport | null;
  error?: string;
};

function batchHosts(): string[] {
  return [PUBLIC_ML_URL, PUBLIC_OPS_URL, ""]
    .map((h) => (h || "").replace(/\/+$/, ""))
    .filter((h, i, arr) => (h === "" || h.startsWith("http")) && arr.indexOf(h) === i)
    .map((h) => (h ? `${h}/detect-batch` : "/api/detect-batch"));
}

export async function detectFolder(
  files: { file: File; filename: string }[],
  conf: number,
  onChunk?: (done: number, total: number, current: string) => void,
): Promise<BatchDetectItem[]> {
  const out: BatchDetectItem[] = [];
  const chunkSize = 20;
  for (let i = 0; i < files.length; i += chunkSize) {
    const slice = files.slice(i, i + chunkSize);
    onChunk?.(i, files.length, slice[0]?.filename ?? "");
    const blobs: { filename: string; blob: Blob }[] = [];
    for (const item of slice) {
      blobs.push({ filename: item.filename, blob: await compressFrame(item.file) });
    }
    let parsed: { results?: { filename?: string; report?: DetectReport; error?: string }[] } | null = null;
    let lastError = "Batch detector failed";
    for (const url of batchHosts()) {
      const form = new FormData();
      form.append("conf_threshold", String(conf));
      form.append("metadata", JSON.stringify({ sensor: "side-scan-sonar" }));
      for (const item of blobs) {
        form.append("images", item.blob, item.filename);
      }
      try {
        const res = await fetch(url, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status === 404) {
          lastError = `No batch detector at ${url}`;
          continue;
        }
        const data = (await res.json()) as {
          results?: { filename?: string; report?: DetectReport; error?: string }[];
          error?: string;
        };
        if (res.ok && Array.isArray(data.results) && data.results.length) {
          parsed = data;
          break;
        }
        lastError = data.error || `Batch failed (${res.status})`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
      }
    }
    if (parsed?.results) {
      for (const item of slice) {
        const hit = parsed.results.find((r) => r.filename === item.filename) ?? parsed.results[slice.indexOf(item)];
        out.push({
          filename: item.filename,
          report: hit?.report ?? null,
          error: hit?.report ? undefined : hit?.error || lastError,
        });
      }
    } else {
      for (const item of slice) {
        out.push({ filename: item.filename, report: null, error: lastError });
      }
    }
    onChunk?.(Math.min(i + slice.length, files.length), files.length, "");
  }
  return out;
}
