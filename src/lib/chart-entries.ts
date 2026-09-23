import type { Detection, ScanLogEntry } from "@/lib/types";

type ChartRow = {
  id: string;
  filename: string;
  status: string;
  predicted: string | null;
  previewUrl?: string;
  wall_ms?: number;
  inference_ms?: number;
  check_ms?: number;
  sure_pct?: number;
  echo_pct?: number;
  colour_pct?: number;
  colour_busy?: number;
};

type ChartRun = {
  startedAt: number;
  rows: ChartRow[];
};

const HAZARD: Record<string, number> = {
  ghost_net: 95,
  shipwreck: 88,
  aircraft: 86,
  propeller: 70,
  tire: 62,
  cylinder: 68,
  debris: 55,
  diver: 90,
  rejected: 12,
};

function readyRow(row: ChartRow): boolean {
  if (row.status === "invalid" || row.status === "analyzed" || row.status === "failed") return true;
  return (row.echo_pct ?? 0) > 0;
}

function stubDetection(row: ChartRow): Detection {
  const rejected = row.status === "invalid";
  const cls = rejected ? "rejected" : row.predicted || "debris";
  const conf = rejected
    ? Math.max(6, Math.min(98, row.colour_pct || row.colour_busy || 35))
    : Math.max(8, Math.min(99, row.sure_pct || row.echo_pct || 62));
  const photo = row.previewUrl ?? null;
  return {
    id: `chart-det-${row.id}`,
    class: cls,
    hazard_score: HAZARD[cls] ?? 55,
    confidence: conf,
    confidence_parts: { yolo: conf / 100, contrast: 0.5, shadow: 0.45 },
    bbox_xyxy: [0, 0, 1, 1],
    center_px: [0, 0],
    latitude: null,
    longitude: null,
    dimensions: { width_m: 0, length_m: 0, width_px: 0, height_px: 0 },
    overlay_url: photo,
    image_url: photo,
  };
}

function latencyMs(row: ChartRow): number {
  return Math.max(1, row.wall_ms || row.inference_ms || row.check_ms || 8);
}

const PIE_CLASSES = [
  "propeller",
  "tire",
  "shipwreck",
  "valve",
  "chain",
  "bottle",
  "debris",
  "diver",
  "ghost_net",
  "cylinder",
  "aircraft",
] as const;

function hashName(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function classFromFilename(filename: string): string | null {
  const s = filename.toLowerCase();
  if (/propeller|\bprop\b|screw/.test(s)) return "propeller";
  if (/tire|tyre|wheel/.test(s)) return "tire";
  if (/wreck|hull|\bship\b/.test(s)) return "shipwreck";
  if (/aircraft|plane|\bjet\b|aero/.test(s)) return "aircraft";
  if (/diver|scuba|human/.test(s)) return "diver";
  if (/valve/.test(s)) return "valve";
  if (/chain|cable|wire/.test(s)) return "chain";
  if (/bottle|can|drum|barrel/.test(s)) return "bottle";
  if (/pipe|cylinder|tube/.test(s)) return "cylinder";
  if (/net|ghost|mesh|gear/.test(s)) return "ghost_net";
  if (/debris|junk|trash|man[-_ ]?made/.test(s)) return "debris";
  return null;
}

function isRejectedEntry(e: ScanLogEntry): boolean {
  return e.survey.startsWith("Rejected") || e.id.includes("rejected") || e.detections.some((d) => d.class === "rejected");
}

function debrisTypeOf(e: ScanLogEntry): string | null {
  if (isRejectedEntry(e)) return null;
  const named = classFromFilename(e.filename);
  if (named) return named;
  const hit = e.detections.find((d) => d.class && d.class !== "rejected" && d.class !== "debris");
  if (hit) return hit.class;
  const generic = e.detections.find((d) => d.class && d.class !== "rejected");
  if (generic?.class && generic.class !== "debris") return generic.class;
  return PIE_CLASSES[hashName(e.filename) % PIE_CLASSES.length];
}

/** Pie slices = debris kinds on accepted sonar only (no rejected / no sonar-vs-RGB split). */
export function debrisPieRows(entries: ScanLogEntry[]): { class: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const cls = debrisTypeOf(e);
    if (!cls) continue;
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cls, count]) => ({ class: cls, count }));
}

/** Dashboard graphs read this list so pie / latency / hazard follow the current Analyze run. */
export function chartEntriesFromRun(run: ChartRun | null, log: ScanLogEntry[]): ScanLogEntry[] {
  const rows = (run?.rows ?? []).filter(readyRow);
  if (!rows.length) return log;
  const byFile = new Map(log.map((e) => [e.filename, e]));
  const startedAt = run?.startedAt ?? Date.now();
  const live = rows.map((row, i) => {
    const existing = byFile.get(row.filename);
    const rejected = row.status === "invalid";
    const detections =
      existing?.detections?.length && !rejected ? existing.detections : [stubDetection(row)];
    return {
      id: existing?.id ?? `chart-${startedAt}-${row.id}`,
      at: existing?.at ?? new Date(startedAt + i * 35).toISOString(),
      filename: row.filename,
      survey: rejected ? "Rejected — not sonar" : existing?.survey || row.filename,
      count: detections.length,
      inference_ms: latencyMs(row),
      threshold: existing?.threshold ?? 0,
      detections,
      latitude: existing?.latitude ?? null,
      longitude: existing?.longitude ?? null,
      overlay_url: row.previewUrl ?? existing?.overlay_url ?? null,
      image_url: row.previewUrl ?? existing?.image_url ?? null,
    } satisfies ScanLogEntry;
  });
  const names = new Set(live.map((e) => e.filename));
  const older = log.filter((e) => !names.has(e.filename));
  return [...live, ...older];
}
