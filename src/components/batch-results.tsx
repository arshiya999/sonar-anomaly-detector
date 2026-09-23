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
  background: "#0c4a6e",
  border: "1px solid #22d3ee",
  borderRadius: 10,
  fontSize: 12,
  color: "#ecfeff",
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

function seriesFromRun(run: BatchRun | null) {
  const rows = run?.rows ?? [];
  let uploaded = 0;
  let valid = 0;
  let invalid = 0;
  let identified = 0;
  let failed = 0;
  return rows.map((row, idx) => {
    uploaded += 1;
    if (row.status === "invalid") invalid += 1;
    else valid += 1;
    if (row.status === "analyzed") identified += 1;
    if (row.status === "failed") failed += 1;
    const latency = row.status === "invalid" ? 0 : row.wall_ms || row.inference_ms || 0;
    return {
      i: idx + 1,
      name: row.filename,
      uploaded,
      valid,
      invalid,
      identified,
      failed,
      latency,
    };
  });
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const series = seriesFromRun(run);
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
    <div id="sih-batch-results" className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50">
      <p className="font-heading text-xl font-bold text-white">Batch results</p>
      <p className="mt-1 text-xs text-cyan-200">
        One graph: uploaded, valid, invalid, identified, and latency. Cards are the six numbers a judge needs
        in one screenshot.
      </p>

      {run && !run.finished ? (
        <p className="mt-3 font-mono text-sm text-amber-200">
          {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
          {run.current ? ` · ${run.current}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.k} className="rounded-xl border border-cyan-700/80 bg-cyan-950/50 px-3 py-2">
            <p className="text-[10px] tracking-wide text-cyan-300 uppercase">{c.k}</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{c.v}</p>
            <p className="text-[11px] text-cyan-200/80">{c.d}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <p className="mt-6 rounded-xl bg-cyan-950/50 px-4 py-12 text-center text-sm text-cyan-200">
          Add files on Upload, then Analyze. The graph plots uploaded, valid, invalid, and identified vs image
          number, with latency on the right axis.
        </p>
      ) : (
        <div className="mt-5 h-[420px] rounded-xl bg-cyan-950/30 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 16, right: 28, left: 8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
              <XAxis
                dataKey="i"
                tick={{ fill: "#bae6fd", fontSize: 11 }}
                label={{ value: "Image in this batch", position: "insideBottom", offset: -16, fill: "#a5f3fc" }}
              />
              <YAxis
                yAxisId="left"
                allowDecimals={false}
                tick={{ fill: "#bae6fd", fontSize: 11 }}
                label={{ value: "Cumulative count", angle: -90, position: "insideLeft", fill: "#a5f3fc" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#fde68a", fontSize: 11 }}
                label={{ value: "Latency (ms)", angle: 90, position: "insideRight", fill: "#fde68a" }}
              />
              <Tooltip
                contentStyle={TOOLTIP}
                labelFormatter={(v, pts) => {
                  const name = (pts?.[0]?.payload as { name?: string } | undefined)?.name;
                  return name ? `Image ${v} · ${name}` : `Image ${v}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "#ecfeff" }} />
              <Line yAxisId="left" type="monotone" dataKey="uploaded" name="Uploaded" stroke="#67e8f9" strokeWidth={2.4} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="valid" name="Valid sonar" stroke="#34d399" strokeWidth={2.4} dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="invalid" name="Invalid" stroke="#f87171" strokeWidth={2.4} dot={false} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="identified"
                name="Successfully identified"
                stroke="#38bdf8"
                strokeWidth={2.4}
                dot={false}
              />
              <Line yAxisId="left" type="monotone" dataKey="failed" name="Failed" stroke="#fbbf24" strokeWidth={2} dot={false} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="latency"
                name="Latency (ms)"
                stroke="#fde68a"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
