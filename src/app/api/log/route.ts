import { NextRequest } from "next/server";
import { appendLog, readLog, saveOverlayJpeg } from "@/lib/log-store";
import type { DetectReport } from "@/lib/types";
import { opsApiUrl } from "@/lib/upstream";

export const maxDuration = 30;

const OPS = opsApiUrl();

export async function GET() {
  try {
    const res = await fetch(`${OPS}/api/ops/log`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.entries)) {
        return Response.json({ entries: data.entries, source: "postgres" });
      }
    }
  } catch {
    /* ops API offline */
  }
  return Response.json({ entries: readLog(), source: "file" });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    filename?: string;
    report?: DetectReport;
    overlay_jpeg_base64?: string | null;
  };
  if (!body.report) {
    return Response.json({ error: "report required" }, { status: 400 });
  }
  const id = `SCAN-${crypto.randomUUID().slice(0, 8)}`;
  const overlayUrl = saveOverlayJpeg(id, body.overlay_jpeg_base64);
  try {
    const ingest = await fetch(`${OPS}/api/ingest/ml-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: body.filename || "upload",
        report: body.report,
        overlay_jpeg_base64: body.overlay_jpeg_base64 ?? null,
      }),
    });
    if (ingest.ok) {
      const logRes = await fetch(`${OPS}/api/ops/log`, { cache: "no-store" });
      if (logRes.ok) {
        const data = await logRes.json();
        if (Array.isArray(data.entries)) {
          const filename = body.filename || "upload";
          let attached = false;
          const entries = data.entries.map((e: { filename?: string; overlay_url?: string | null; image_url?: string | null }) => {
            if (attached || e.filename !== filename) return e;
            attached = true;
            const photo = overlayUrl || e.overlay_url || e.image_url;
            return { ...e, overlay_url: photo, image_url: e.image_url || photo };
          });
          return Response.json({ ok: true, entries, source: "postgres" });
        }
      }
    }
  } catch {
    /* still keep local log */
  }
  const detections = body.report.detections.map((d) => ({
    ...d,
    overlay_url: d.overlay_url ?? overlayUrl,
    image_url: d.image_url ?? overlayUrl,
  }));
  const entries = appendLog({
    id,
    at: new Date().toISOString(),
    filename: body.filename || "upload",
    survey: String(body.report.survey_id || "unspecified"),
    count: body.report.count,
    inference_ms: body.report.inference_ms,
    threshold: body.report.threshold,
    detections,
    latitude: body.report.detections[0]?.latitude ?? (body.report.metadata?.latitude as number | null | undefined) ?? null,
    longitude: body.report.detections[0]?.longitude ?? (body.report.metadata?.longitude as number | null | undefined) ?? null,
    overlay_url: overlayUrl,
    image_url: overlayUrl,
  });
  return Response.json({ ok: true, entries, source: "file" });
}
