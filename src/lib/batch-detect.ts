import { PUBLIC_ML_URL, PUBLIC_OPS_URL } from "@/lib/public-upstreams";
import type { DetectReport, DetectResponse } from "@/lib/types";
import { compressFrame } from "@/lib/compress-frame";

export type BatchDetectItem = {
  filename: string;
  report: DetectReport | null;
  error?: string;
};

function detectUrls(): string[] {
  return [PUBLIC_ML_URL, PUBLIC_OPS_URL, ""]
    .map((h) => (h || "").replace(/\/+$/, ""))
    .filter((h, i, arr) => (h === "" || h.startsWith("http")) && arr.indexOf(h) === i)
    .map((h) => (h ? `${h}/detect` : "/api/detect"));
}

function batchUrls(): string[] {
  return [PUBLIC_ML_URL, PUBLIC_OPS_URL, ""]
    .map((h) => (h || "").replace(/\/+$/, ""))
    .filter((h, i, arr) => (h === "" || h.startsWith("http")) && arr.indexOf(h) === i)
    .map((h) => (h ? `${h}/detect-batch` : "/api/detect-batch"));
}

async function detectOne(blob: Blob, filename: string, conf: number): Promise<DetectReport | null> {
  for (const url of detectUrls()) {
    const form = new FormData();
    form.append("image", blob, filename);
    form.append("return_overlay", "false");
    form.append("conf_threshold", String(conf));
    form.append("metadata", JSON.stringify({ sensor: "side-scan-sonar", survey: filename }));
    try {
      const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(18_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as DetectResponse;
      if (data?.report) return data.report;
    } catch {
      /* try next host */
    }
  }
  return null;
}

export async function detectFolder(
  files: { file: File; filename: string }[],
  conf: number,
  onChunk?: (done: number, total: number, current: string) => void,
): Promise<BatchDetectItem[]> {
  const out: BatchDetectItem[] = files.map((f) => ({ filename: f.filename, report: null }));
  const byName = new Map(out.map((row) => [row.filename, row]));
  const gate = Math.min(Math.max(conf, 0.12), 0.22);
  const chunkSize = 12;

  for (let i = 0; i < files.length; i += chunkSize) {
    const slice = files.slice(i, i + chunkSize);
    onChunk?.(i, files.length, slice[0]?.filename ?? "");
    const blobs: { filename: string; blob: Blob }[] = [];
    for (const item of slice) {
      blobs.push({ filename: item.filename, blob: await compressFrame(item.file, 512, 0.72) });
    }

    let parsed: { results?: { filename?: string; report?: DetectReport }[] } | null = null;
    for (const url of batchUrls()) {
      const form = new FormData();
      form.append("conf_threshold", String(gate));
      form.append("metadata", JSON.stringify({ sensor: "side-scan-sonar" }));
      for (const item of blobs) form.append("images", item.blob, item.filename);
      try {
        const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(40_000) });
        if (res.status === 404 || res.status === 405) continue;
        const data = (await res.json()) as { results?: { filename?: string; report?: DetectReport }[]; error?: string };
        if (res.ok && Array.isArray(data.results) && data.results.length) {
          parsed = data;
          break;
        }
      } catch {
        /* try next host or per-image */
      }
    }

    if (parsed?.results) {
      parsed.results.forEach((hit, idx) => {
        const name = hit.filename || slice[idx]?.filename;
        const row = name ? byName.get(name) : undefined;
        if (row && hit.report) row.report = hit.report;
      });
    }

    const missing = blobs.filter((b) => !byName.get(b.filename)?.report);
    const workers = 5;
    for (let w = 0; w < missing.length; w += workers) {
      const part = missing.slice(w, w + workers);
      onChunk?.(i + (slice.length - missing.length) + w, files.length, part[0]?.filename ?? "");
      await Promise.all(
        part.map(async (item) => {
          const report = await detectOne(item.blob, item.filename, gate);
          const row = byName.get(item.filename);
          if (row) {
            row.report = report;
            if (!report) row.error = "Detector did not return a report";
          }
        }),
      );
    }
    onChunk?.(Math.min(i + slice.length, files.length), files.length, "");
  }
  return out;
}
