"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { VAL_EVALUATION } from "@/lib/evaluation";

export type BatchStatus = "queued" | "invalid" | "analyzed" | "failed";

export type BatchRow = {
  id: string;
  filename: string;
  status: BatchStatus;
  reason?: string;
  predicted: string | null;
  count: number;
  inference_ms: number;
  preprocess_ms: number;
  postprocess_ms: number;
  wall_ms: number;
  previewUrl?: string;
  check_ms?: number;
  file_kb?: number;
  colour_pct?: number;
  colour_busy?: number;
};

export type BatchRun = {
  uploaded: number;
  valid: number;
  invalid: number;
  analyzed: number;
  failed: number;
  done: number;
  total: number;
  phase: "validate" | "analyze" | "done";
  current: string;
  startedAt: number;
  elapsedMs: number;
  finished: boolean;
  rows: BatchRow[];
};

const TOOLTIP = {
  background: "#023e8a",
  border: "1px solid #90e0ef",
  borderRadius: 12,
  fontSize: 12,
  color: "#caf0f8",
  boxShadow: "0 10px 28px rgba(2, 62, 138, 0.45)",
};

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${(s - m * 60).toFixed(0)} s`;
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function summarizeBatch(run: BatchRun | null) {
  const rows = run?.rows ?? [];
  const analyzedRows = rows.filter((r) => r.status === "analyzed");
  const failed = rows.filter((r) => r.status === "failed").length;
  const invalid = run?.invalid ?? rows.filter((r) => r.status === "invalid").length;
  const uploaded = run?.uploaded ?? rows.length;
  const valid = run?.valid ?? uploaded - invalid;
  const analyzed = run?.analyzed ?? analyzedRows.length;
  const wallMs = run?.elapsedMs ?? 0;
  const inferenceMs = analyzedRows.reduce((s, r) => s + (r.inference_ms || 0), 0);
  const preprocessMs = analyzedRows.reduce((s, r) => s + (r.preprocess_ms || 0), 0);
  const postprocessMs = analyzedRows.reduce((s, r) => s + (r.postprocess_ms || 0), 0);
  const avgWall = analyzedRows.length
    ? analyzedRows.reduce((s, r) => s + r.wall_ms, 0) / analyzedRows.length
    : 0;
  const avgInfer = analyzedRows.length ? inferenceMs / analyzedRows.length : 0;
  const avgPre = analyzedRows.length ? preprocessMs / analyzedRows.length : 0;
  const avgPost = analyzedRows.length ? postprocessMs / analyzedRows.length : 0;
  const seconds = wallMs / 1000;
  const throughput = seconds > 0 ? analyzed / seconds : 0;
  const detections = analyzedRows.reduce((s, r) => s + (r.count || 0), 0);
  return {
    uploaded,
    valid,
    invalid,
    analyzed,
    failed,
    validationRate: uploaded ? (100 * valid) / uploaded : 0,
    rejectionRate: uploaded ? (100 * invalid) / uploaded : 0,
    analysisSuccessRate: valid ? (100 * analyzed) / valid : 0,
    inferenceMs,
    preprocessMs,
    postprocessMs,
    wallMs,
    avgWall,
    avgInfer,
    avgPre,
    avgPost,
    throughput,
    detections,
  };
}

function validSeries(run: BatchRun | null) {
  const rows = (run?.rows ?? []).filter((r) => r.status !== "invalid");
  return rows.map((row, idx) => ({
    i: idx + 1,
    name: row.filename,
    debris: row.count,
    tookMs: row.wall_ms || row.inference_ms || 0,
  }));
}

function invalidSeries(run: BatchRun | null) {
  const rows = (run?.rows ?? []).filter((r) => {
    if (r.status !== "invalid") return false;
    const colour = r.colour_pct ?? 0;
    const busy = r.colour_busy ?? 0;
    const check = r.check_ms || 0;
    return colour > 8 || busy > 8 || check > 20;
  });
  return rows.map((row, idx) => ({
    i: idx + 1,
    name: row.filename,
    cameraLook: Math.max(row.colour_pct ?? 0, row.colour_busy ?? 0),
    rejectMs: Math.max(row.check_ms || 0, 1),
    reason: row.reason ?? "Not side-scan sonar",
  }));
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const valid = validSeries(run);
  const invalid = invalidSeries(run);
  const empty = !run || run.rows.length === 0;

  const cards: { k: string; v: string; d: string }[] = [
    { k: "Analyzed", v: String(stats.analyzed), d: "Valid sonar scored" },
    { k: "Detections", v: String(stats.detections), d: "Contacts in this batch" },
    { k: "Time taken", v: fmtDuration(stats.wallMs), d: "Wall clock" },
    { k: "Throughput", v: stats.throughput ? `${stats.throughput.toFixed(2)} img/s` : "—", d: "Analyzed per second" },
    { k: "Precision", v: fmtScore(VAL_EVALUATION.precision), d: "Val set" },
    { k: "mAP@50", v: fmtScore(VAL_EVALUATION.map50), d: "Val boxes" },
  ];

  return (
    <div
      id="sih-batch-results"
      className="overflow-hidden rounded-2xl border-2 border-cyan-600 p-5 text-cyan-50 shadow-[0_12px_40px_rgba(3,4,94,0.4)]"
      style={{
        background:
          "radial-gradient(900px 320px at 8% -10%, rgba(0,180,216,0.28), transparent 52%), radial-gradient(720px 280px at 100% 0%, rgba(0,119,182,0.35), transparent 48%), linear-gradient(165deg, #0077b6 0%, #023e8a 48%, #03045e 100%)",
      }}
    >
      <p className="font-heading text-xl font-bold text-white drop-shadow">Batch results</p>
      <p className="mt-1 text-xs font-medium text-cyan-50">
        Two simple graphs. Each has two lines. One line is the result for that picture. The other line is how long that picture took.
      </p>

      {run && !run.finished ? (
        <p className="mt-3 font-mono text-sm text-yellow-200">
          {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
          {run.current ? ` · ${run.current}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div
            key={c.k}
            className="rounded-xl border border-cyan-400/40 bg-cyan-950/45 px-3 py-2 shadow-[0_0_18px_rgba(0,119,182,0.35)]"
          >
            <p className="text-[10px] tracking-wide text-cyan-200 uppercase">{c.k}</p>
            <p className="mt-0.5 text-lg font-semibold text-white drop-shadow-sm">{c.v}</p>
            <p className="text-[11px] text-cyan-50">{c.d}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <p className="mt-6 rounded-xl bg-white/20 px-4 py-12 text-center text-sm text-white">
          Add files on Upload, then Analyze. Mix sonar with a colour photo to fill the right graph.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border-2 border-cyan-500/70 bg-[#012a4a]/85 p-3 shadow-inner">
            <p className="text-sm font-semibold text-cyan-50">Sonar pictures (accepted)</p>
            <p className="mb-2 text-[11px] text-cyan-100">
              Solid aqua: how many debris pieces the system saw in that picture (0, 1, 2…). Dashed cyan: how many
              milliseconds that picture took to analyse. Peaks mean a busy wreck field or a slower image.
            </p>
            {valid.length === 0 ? (
              <p className="grid h-[320px] place-items-center text-sm text-cyan-100">No valid sonar in this run.</p>
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valid} margin={{ top: 40, right: 40, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="#0077b6" strokeOpacity={0.55} />
                    <XAxis dataKey="i" tick={{ fill: "#90e0ef", fontSize: 11 }} axisLine={{ stroke: "#0096c7" }} />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fill: "#90e0ef", fontSize: 11 }}
                      label={{ value: "Debris pieces seen", angle: -90, position: "insideLeft", fill: "#00f5d4" }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "#ffe66d", fontSize: 11 }}
                      label={{ value: "Time this picture took (ms)", angle: 90, position: "insideRight", fill: "#ffe66d" }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      labelFormatter={(v, pts) => {
                        const name = (pts?.[0]?.payload as { name?: string } | undefined)?.name;
                        return name ? `Valid ${v} · ${name}` : `Valid ${v}`;
                      }}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#e0fbfc" }} />
                    <Line yAxisId="left" type="linear" dataKey="debris" name="Debris pieces seen in this picture" stroke="#00f5d4" strokeWidth={3.4} dot={{ r: 4, fill: "#80ffdb" }} />
                    <Line
                      yAxisId="right"
                      type="linear"
                      dataKey="tookMs"
                      name="Time this picture took (ms)"
                      stroke="#48cae4"
                      strokeWidth={2.4}
                      strokeDasharray="6 4"
                      dot={{ r: 3, fill: "#90e0ef" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-center text-[11px] font-medium text-cyan-50">Sonar picture number</p>
          </div>

          <div className="rounded-2xl border-2 border-cyan-500/70 bg-[#012a4a]/85 p-3 shadow-inner">
            <p className="text-sm font-semibold text-cyan-50">Not sonar (tiger, garden, camera photos)</p>
            <p className="mb-2 text-[11px] text-cyan-100">
              Solid aqua: how much this file looks like an everyday colour photo (higher = more like a camera snap, so
              we refuse it). Dashed cyan: how long that quick look took. Empty zeros are hidden so the line does not go
              flat after the real photos.
            </p>
            {invalid.length === 0 ? (
              <p className="grid h-[320px] place-items-center px-4 text-center text-sm text-cyan-100">
                No invalid files this run. Add a colour photo with the sonar set to see this graph climb.
              </p>
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={invalid} margin={{ top: 40, right: 40, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 6" stroke="#0077b6" strokeOpacity={0.55} />
                    <XAxis dataKey="i" tick={{ fill: "#90e0ef", fontSize: 11 }} axisLine={{ stroke: "#0096c7" }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "#90e0ef", fontSize: 11 }}
                      label={{ value: "Looks like a camera photo", angle: -90, position: "insideLeft", fill: "#00f5d4" }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "#ffe66d", fontSize: 11 }}
                      label={{ value: "Time to reject (ms)", angle: 90, position: "insideRight", fill: "#ffe66d" }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      labelFormatter={(v, pts) => {
                        const row = pts?.[0]?.payload as { name?: string } | undefined;
                        return row?.name ? `Invalid ${v} · ${row.name}` : `Invalid ${v}`;
                      }}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#e0fbfc" }} />
                    <Line
                      yAxisId="left"
                      type="linear"
                      dataKey="cameraLook"
                      name="Looks like a normal camera photo"
                      stroke="#00f5d4"
                      strokeWidth={3.4}
                      dot={{ r: 4, fill: "#80ffdb" }}
                    />
                    <Line
                      yAxisId="right"
                      type="linear"
                      dataKey="rejectMs"
                      name="Time to reject this file (ms)"
                      stroke="#48cae4"
                      strokeWidth={2.4}
                      strokeDasharray="6 4"
                      dot={{ r: 3, fill: "#90e0ef" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-center text-[11px] font-medium text-cyan-50">Rejected picture number</p>
          </div>
        </div>
      )}
    </div>
  );
}
