import type { DetectReport, Detection, ScanLogEntry, SurveyPin } from "@/lib/types";
import { CLASS_LABEL } from "@/lib/labels";
import { presentConfidencePct } from "@/lib/confidence";

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

/** NIOT / Bay of Bengal — used only when a ping has no GNSS, so the map still shows pins. */
export const SURVEY_PLOT_ORIGIN: [number, number] = [13.0827, 80.2707];

export function lastMappedPosition(entries: ScanLogEntry[]): [number, number] | null {
  for (const e of entries) {
    const lat = asCoord(e.latitude) ?? asCoord(e.detections[0]?.latitude);
    const lon = asCoord(e.longitude) ?? asCoord(e.detections[0]?.longitude);
    if (lat != null && lon != null) return [lat, lon];
  }
  return null;
}

export function isPlausibleGnss(lat?: number | null, lon?: number | null): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) < 0.05 && Math.abs(lon) < 0.05) return false;
  if (Math.abs(lat) > 85) return false;
  return true;
}

/** Spread pins on a readable grid so a 30-file run does not stack. */
export function gridLatLon(index: number): { lat: number; lon: number } {
  const col = index % 8;
  const row = Math.floor(index / 8);
  return {
    lat: SURVEY_PLOT_ORIGIN[0] + 0.016 * (2 - row),
    lon: SURVEY_PLOT_ORIGIN[1] + 0.02 * (col - 3.5),
  };
}

export type ImagePinInput = {
  id: string;
  filename: string;
  previewUrl?: string | null;
  status: string;
  predicted?: string | null;
  count?: number;
  sure_pct?: number | null;
  echo_pct?: number | null;
};

/** One map pin per Analyze row — accepted sonar and rejected RGB. */
export function pinsFromImageRows(rows: ImagePinInput[], runId = "run"): SurveyPin[] {
  const ready = rows.filter((r) => {
    if (r.status === "invalid" || r.status === "analyzed" || r.status === "failed") return true;
    return (r.echo_pct ?? 0) > 0;
  });
  return ready.map((r, index) => {
    const spot = gridLatLon(index);
    const rejected = r.status === "invalid";
    return {
      id: `${runId}-${r.id}`,
      filename: r.filename,
      latitude: spot.lat,
      longitude: spot.lon,
      overlay_url: r.previewUrl || null,
      material: rejected
        ? "Rejected"
        : r.predicted
          ? CLASS_LABEL[r.predicted] ?? r.predicted
          : "Sonar",
      classId: r.predicted ?? undefined,
      confidence: r.sure_pct ?? null,
      latest: index === ready.length - 1,
      ageLabel: rejected ? "Rejected RGB" : "Accepted sonar",
      hitCount: r.count ?? 0,
      contactSummary: rejected ? "Rejected" : "Sonar",
    } satisfies SurveyPin;
  });
}

/** Always returns a pin location. GNSS if known; otherwise next point on the survey plot. */
export function plotPosition(
  entries: ScanLogEntry[],
  lat?: number | null,
  lon?: number | null,
): { lat: number; lon: number; gnss: boolean } {
  if (isPlausibleGnss(lat, lon)) {
    return { lat: lat as number, lon: lon as number, gnss: true };
  }
  const last = lastMappedPosition(entries);
  if (last) {
    const n = entries.length + 1;
    return {
      lat: last[0] + 0.012 * ((n % 5) - 2),
      lon: last[1] + 0.014 * ((n % 4) - 1.5),
      gnss: false,
    };
  }
  return { lat: SURVEY_PLOT_ORIGIN[0], lon: SURVEY_PLOT_ORIGIN[1], gnss: false };
}

export function coordsFromReport(report: DetectReport): [number | null, number | null] {
  const fromMetaLat = asCoord(report.metadata?.latitude);
  const fromMetaLon = asCoord(report.metadata?.longitude);
  if (fromMetaLat != null && fromMetaLon != null) return [fromMetaLat, fromMetaLon];
  const hit = report.detections.find((d) => asCoord(d.latitude) != null && asCoord(d.longitude) != null);
  if (hit) return [asCoord(hit.latitude), asCoord(hit.longitude)];
  return [null, null];
}

export function geotagReport(report: DetectReport, lat: number | null, lon: number | null): DetectReport {
  const detections = report.detections.map((d) => ({
    ...d,
    confidence: presentConfidencePct(d.confidence),
    latitude: lat != null ? lat : d.latitude,
    longitude: lon != null ? lon : d.longitude,
  }));
  return {
    ...report,
    detections,
    metadata: {
      ...report.metadata,
      ...(lat != null && lon != null ? { latitude: lat, longitude: lon } : {}),
    },
  };
}

export function toLogEntry(opts: {
  id: string;
  filename: string;
  report: DetectReport;
  lat: number | null;
  lon: number | null;
  overlay?: string | null;
  imageUrl?: string | null;
  pinLabel?: string;
}): ScanLogEntry {
  const photo = opts.overlay ?? opts.imageUrl ?? null;
  return {
    id: opts.id,
    at: new Date().toISOString(),
    filename: opts.filename,
    survey: opts.pinLabel || String(opts.report.survey_id || opts.filename),
    count: opts.report.count,
    inference_ms: opts.report.inference_ms,
    threshold: opts.report.threshold,
    detections: opts.report.detections.map((d) => ({
      ...d,
      overlay_url: d.overlay_url ?? photo,
      image_url: d.image_url ?? opts.imageUrl ?? photo,
    })),
    latitude: opts.lat,
    longitude: opts.lon,
    overlay_url: photo,
    image_url: opts.imageUrl ?? photo,
  };
}

export function mergeLogs(existing: ScanLogEntry[], incoming: ScanLogEntry[]): ScanLogEntry[] {
  const byId = new Map<string, ScanLogEntry>();
  const byFile = new Map<string, ScanLogEntry>();
  for (const e of incoming) byFile.set(e.filename, e);
  for (const raw of [...existing, ...incoming]) {
    const hint = byFile.get(raw.filename);
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
      raw.overlay_url || hint?.overlay_url || raw.image_url || hint?.image_url || null;
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
    byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
}

function photoOf(e: ScanLogEntry): string | null {
  return e.overlay_url || e.image_url || e.detections.find((d) => d.overlay_url || d.image_url)?.overlay_url
    || e.detections.find((d) => d.image_url)?.image_url || null;
}

export function pinsFromLog(entries: ScanLogEntry[]): SurveyPin[] {
  const unique = [...entries].sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
  return unique.map((e, index) => {
    const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
    const spot = gridLatLon(index);
    const rawLat = asCoord(e.latitude) ?? asCoord(top?.latitude);
    const rawLon = asCoord(e.longitude) ?? asCoord(top?.longitude);
    const placed = isPlausibleGnss(rawLat, rawLon) ? { lat: rawLat as number, lon: rawLon as number } : spot;
    const latest = index === 0;
    const rejected = e.survey.startsWith("Rejected") || e.id.includes("rejected");
    return {
      id: e.id,
      filename: e.filename,
      latitude: placed.lat,
      longitude: placed.lon,
      overlay_url: photoOf(e),
      material: top
        ? CLASS_LABEL[top.class] ?? top.class
        : rejected
          ? "Rejected"
          : "Sonar",
      classId: top?.class,
      confidence: top?.confidence != null ? presentConfidencePct(top.confidence) : null,
      confidenceYolo: top?.confidence_parts?.yolo != null ? top.confidence_parts.yolo * 100 : null,
      confidenceContrast: top?.confidence_parts?.contrast != null ? top.confidence_parts.contrast * 100 : null,
      confidenceShadow: top?.confidence_parts?.shadow != null ? top.confidence_parts.shadow * 100 : null,
      latest,
      ageLabel: rejected ? "Rejected RGB" : latest ? "Latest sonar" : "Accepted sonar",
      hitCount: e.count,
      contactSummary: [...new Set(e.detections.map((d) => CLASS_LABEL[d.class] ?? d.class))].join(", "),
    } satisfies SurveyPin;
  });
}

export function rejectedLogEntry(opts: {
  id: string;
  filename: string;
  lat: number;
  lon: number;
  imageUrl?: string | null;
}): ScanLogEntry {
  return {
    id: opts.id,
    at: new Date().toISOString(),
    filename: opts.filename,
    survey: "Rejected — not sonar",
    count: 0,
    inference_ms: 0,
    threshold: 0,
    detections: [],
    latitude: opts.lat,
    longitude: opts.lon,
    overlay_url: opts.imageUrl ?? null,
    image_url: opts.imageUrl ?? null,
  };
}

export function detectionsFromLog(entries: ScanLogEntry[]): (Detection & { source?: string })[] {
  return entries.flatMap((e) =>
    e.detections.map((d) => ({
      ...d,
      source: e.filename,
      confidence: presentConfidencePct(d.confidence),
      latitude: asCoord(d.latitude) ?? asCoord(e.latitude),
      longitude: asCoord(d.longitude) ?? asCoord(e.longitude),
      overlay_url: d.overlay_url ?? e.overlay_url,
      image_url: d.image_url ?? e.image_url,
    })),
  );
}
