import type { DetectReport, Detection, ScanLogEntry, SurveyPin } from "@/lib/types";
import { CLASS_LABEL } from "@/lib/labels";

const FALLBACK: [number, number] = [21.1466, 79.0882];

export function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function asCoord(value: unknown): number | null {
  if (isFiniteCoord(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function lastKnownPosition(entries: ScanLogEntry[]): [number, number] {
  for (const e of entries) {
    const lat = asCoord(e.latitude) ?? asCoord(e.detections[0]?.latitude);
    const lon = asCoord(e.longitude) ?? asCoord(e.detections[0]?.longitude);
    if (lat != null && lon != null) return [lat, lon];
  }
  return FALLBACK;
}

export function placeScan(entries: ScanLogEntry[], lat?: number | null, lon?: number | null): [number, number] {
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return [lat, lon];
  }
  const [baseLat, baseLon] = lastKnownPosition(entries);
  const n = entries.length + 1;
  return [baseLat + 0.035 * ((n % 6) - 2.5), baseLon + 0.04 * ((n % 5) - 2)];
}

export function geotagReport(report: DetectReport, lat: number, lon: number): DetectReport {
  const detections = report.detections.map((d) => ({
    ...d,
    latitude: asCoord(d.latitude) ?? lat,
    longitude: asCoord(d.longitude) ?? lon,
  }));
  return {
    ...report,
    detections,
    metadata: { ...report.metadata, latitude: lat, longitude: lon },
  };
}

export function toLogEntry(opts: {
  id: string;
  filename: string;
  report: DetectReport;
  lat: number;
  lon: number;
  overlay?: string | null;
}): ScanLogEntry {
  return {
    id: opts.id,
    at: new Date().toISOString(),
    filename: opts.filename,
    survey: String(opts.report.survey_id || opts.filename),
    count: opts.report.count,
    inference_ms: opts.report.inference_ms,
    threshold: opts.report.threshold,
    detections: opts.report.detections,
    latitude: opts.lat,
    longitude: opts.lon,
    overlay_url: opts.overlay ?? null,
    image_url: opts.overlay ?? null,
  };
}

export function mergeLogs(server: ScanLogEntry[], local: ScanLogEntry[]): ScanLogEntry[] {
  const localByFile = new Map<string, ScanLogEntry>();
  for (const e of local) localByFile.set(e.filename, e);

  const pending = local.filter((e) => {
    if (!e.id.startsWith("local-")) return false;
    return !server.some(
      (s) =>
        s.filename === e.filename &&
        Math.abs(Date.parse(s.at || "") - Date.parse(e.at || "")) < 120_000,
    );
  });

  const seen = new Set<string>();
  const out: ScanLogEntry[] = [];
  for (const raw of [...pending, ...server]) {
    const hint = localByFile.get(raw.filename);
    const lat =
      asCoord(raw.latitude) ??
      asCoord(raw.detections[0]?.latitude) ??
      asCoord(hint?.latitude) ??
      asCoord(hint?.detections[0]?.latitude);
    const lon =
      asCoord(raw.longitude) ??
      asCoord(raw.detections[0]?.longitude) ??
      asCoord(hint?.longitude) ??
      asCoord(hint?.detections[0]?.longitude);
    const overlay =
      raw.overlay_url?.startsWith("data:") || raw.overlay_url
        ? raw.overlay_url
        : (hint?.overlay_url ?? raw.image_url ?? null);
    const e: ScanLogEntry = {
      ...raw,
      latitude: lat,
      longitude: lon,
      overlay_url: overlay,
      image_url: raw.image_url ?? overlay,
      detections: raw.detections.map((d) => ({
        ...d,
        latitude: asCoord(d.latitude) ?? lat,
        longitude: asCoord(d.longitude) ?? lon,
        overlay_url: d.overlay_url ?? overlay,
        image_url: d.image_url ?? overlay,
      })),
    };
    const key = e.id.startsWith("local-") ? e.id : `${e.filename}:${e.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function pinsFromLog(entries: ScanLogEntry[]): SurveyPin[] {
  return entries.flatMap((e) => {
    const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
    const lat = asCoord(e.latitude) ?? asCoord(top?.latitude);
    const lon = asCoord(e.longitude) ?? asCoord(top?.longitude);
    if (lat == null || lon == null) return [];
    return [
      {
        id: e.id,
        filename: e.filename,
        latitude: lat,
        longitude: lon,
        overlay_url: e.overlay_url ?? e.image_url ?? top?.overlay_url ?? null,
        material: top ? CLASS_LABEL[top.class] ?? top.class : e.filename.replace(/\.[^.]+$/, ""),
        classId: top?.class,
        confidence: top?.confidence ?? null,
      } satisfies SurveyPin,
    ];
  });
}

export function detectionsFromLog(entries: ScanLogEntry[]): (Detection & { source?: string })[] {
  return entries.flatMap((e) =>
    e.detections.map((d) => ({
      ...d,
      source: e.filename,
      latitude: asCoord(d.latitude) ?? asCoord(e.latitude),
      longitude: asCoord(d.longitude) ?? asCoord(e.longitude),
      overlay_url: d.overlay_url ?? e.overlay_url,
      image_url: d.image_url ?? e.image_url,
    })),
  );
}
