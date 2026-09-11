import type { DetectReport, Detection, ScanLogEntry, SurveyPin } from "@/lib/types";
import { CLASS_LABEL } from "@/lib/labels";

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

/** Always returns a pin location. GNSS if known; otherwise next point on the survey plot. */
export function plotPosition(
  entries: ScanLogEntry[],
  lat?: number | null,
  lon?: number | null,
): { lat: number; lon: number; gnss: boolean } {
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon, gnss: true };
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
  if (lat == null || lon == null) return report;
  const detections = report.detections.map((d) => ({
    ...d,
    // One ping / one image shares a single lat/lon. Pixel offsets are for the waterfall, not extra map wrecks.
    latitude: lat,
    longitude: lon,
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
  lat: number | null;
  lon: number | null;
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
    const key = e.id.startsWith("local-") ? e.id : `${e.filename}:${e.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function pinsFromLog(entries: ScanLogEntry[]): SurveyPin[] {
  const persistedFiles = new Set(
    entries.filter((e) => !e.id.startsWith("local-")).map((e) => e.filename),
  );
  const unique = entries.filter((e) => !(e.id.startsWith("local-") && persistedFiles.has(e.filename)));
  const pins = unique.flatMap((e, index) => {
    const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
    const lat = asCoord(e.latitude) ?? asCoord(top?.latitude);
    const lon = asCoord(e.longitude) ?? asCoord(top?.longitude);
    if (lat == null || lon == null) return [];
    const latest = index === 0;
    return [
      {
        id: e.id,
        filename: e.filename,
        latitude: lat,
        longitude: lon,
        overlay_url: e.overlay_url ?? e.image_url ?? top?.overlay_url ?? top?.image_url ?? null,
        material: top ? CLASS_LABEL[top.class] ?? top.class : e.filename.replace(/\.[^.]+$/, ""),
        classId: top?.class,
        confidence: top?.confidence ?? null,
        latest,
        ageLabel: latest ? "Latest ping" : "Earlier ping",
        hitCount: e.count,
        contactSummary: [...new Set(e.detections.map((d) => CLASS_LABEL[d.class] ?? d.class))].join(", "),
      } satisfies SurveyPin,
    ];
  });
  const groups = new Map<string, SurveyPin[]>();
  for (const p of pins) {
    const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  return pins.map((p) => {
    const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
    const list = groups.get(key) ?? [p];
    if (list.length < 2 || p.latest) return p;
    const slot = list.filter((x) => !x.latest).findIndex((x) => x.id === p.id) + 1;
    const dlat = 0.0045 * slot;
    const dlon = 0.0055 * ((slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2));
    return { ...p, latitude: p.latitude + dlat, longitude: p.longitude + dlon };
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
