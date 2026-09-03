import { NextRequest } from "next/server";
import { appendLog, readLog } from "@/lib/log-store";
import type { DetectReport } from "@/lib/types";

export async function GET() {
  return Response.json({ entries: readLog() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    filename?: string;
    report?: DetectReport;
  };
  if (!body.report) {
    return Response.json({ error: "report required" }, { status: 400 });
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
  return Response.json({ ok: true, entries });
}
