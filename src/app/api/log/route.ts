import { NextRequest } from "next/server";
import { appendLog, readLog } from "@/lib/log-store";
import type { DetectReport } from "@/lib/types";

const OPS = process.env.OPS_API_URL ?? "http://127.0.0.1:8766";

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
  const fileEntries = readLog().filter((e) => {
    const n = e.filename.toLowerCase();
    return !n.startsWith("sctd_") && !n.startsWith("wt_marine-debris");
  });
  return Response.json({ entries: fileEntries, source: "file" });
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
          return Response.json({ ok: true, entries: data.entries, source: "postgres" });
        }
      }
    }
  } catch {
    /* still keep local log */
  }
  const entries = appendLog({
    id: `SCAN-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    filename: body.filename || "upload",
    survey: String(body.report.survey_id || "unspecified"),
    count: body.report.count,
    inference_ms: body.report.inference_ms,
    threshold: body.report.threshold,
    detections: body.report.detections,
  });
  return Response.json({ ok: true, entries, source: "file" });
}
