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

function validSeries(run: BatchRun | null) {
  const rows = (run?.rows ?? []).filter((r) => r.status !== "invalid");
  let valid = 0;
  let identified = 0;
  let failed = 0;
  return rows.map((row, idx) => {
    valid += 1;
    if (row.status === "analyzed") identified += 1;
    if (row.status === "failed") failed += 1;
    return {
      i: idx + 1,
      name: row.filename,
      valid,
      identified,
      failed,
      latency: row.wall_ms || row.inference_ms || 0,
    };
  });
}

function invalidSeries(run: BatchRun | null) {
  const rows = (run?.rows ?? []).filter((r) => r.status === "invalid");
  let invalid = 0;
  return rows.map((row, idx) => {
    invalid += 1;
    return {
      i: idx + 1,
      name: row.filename,
      invalid,
      reason: row.reason ?? "Not side-scan sonar",
    };
  });
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
    <div id="sih-batch-results" className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50">
      <p className="font-heading text-xl font-bold text-white">Batch results</p>
      <p className="mt-1 text-xs text-cyan-200">
        Same X–Y graph in two halves: left is valid sonar (counts + latency), right is rejected colour photos
        that never reach YOLO.
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
          Add files on Upload, then Analyze. Mix sonar with a tiger or garden photo to fill the invalid half.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl bg-cyan-950/30 p-3">
            <p className="mb-1 text-sm font-semibold text-emerald-200">Valid sonar</p>
            <p className="mb-2 text-[11px] text-cyan-200">
              Left axis = how many valid frames (and how many were identified). Right axis = latency in ms for
              that frame only.
            </p>
            {valid.length === 0 ? (
              <p className="grid h-[320px] place-items-center text-sm text-cyan-200">No valid sonar in this run.</p>
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={valid} margin={{ top: 28, right: 36, left: 8, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
                    <XAxis
                      dataKey="i"
                      tick={{ fill: "#bae6fd", fontSize: 11 }}
                      height={40}
                      label={{ value: "Valid image number", position: "bottom", offset: 12, fill: "#a5f3fc" }}
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fill: "#bae6fd", fontSize: 11 }}
                      label={{ value: "Count", angle: -90, position: "insideLeft", fill: "#a5f3fc" }}
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
                        return name ? `Valid ${v} · ${name}` : `Valid ${v}`;
                      }}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
                    <Line yAxisId="left" type="monotone" dataKey="valid" name="Valid sonar" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="identified"
                      name="Successfully identified"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
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

          <div className="rounded-xl bg-cyan-950/30 p-3">
            <p className="mb-1 text-sm font-semibold text-rose-200">Invalid — not sonar</p>
            <p className="mb-2 text-[11px] text-cyan-200">
              Tiger, garden, and other colour photos. Counted here and never sent to the detector.
            </p>
            {invalid.length === 0 ? (
              <p className="grid h-[320px] place-items-center px-4 text-center text-sm text-cyan-200">
                No invalid files this run. Add a colour photo with the sonar set to see this half climb.
              </p>
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={invalid} margin={{ top: 28, right: 16, left: 8, bottom: 36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
                    <XAxis
                      dataKey="i"
                      tick={{ fill: "#bae6fd", fontSize: 11 }}
                      height={40}
                      label={{ value: "Invalid image number", position: "bottom", offset: 12, fill: "#a5f3fc" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#fecaca", fontSize: 11 }}
                      label={{ value: "Rejected count", angle: -90, position: "insideLeft", fill: "#fecaca" }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      labelFormatter={(v, pts) => {
                        const row = pts?.[0]?.payload as { name?: string; reason?: string } | undefined;
                        return row?.name ? `Invalid ${v} · ${row.name}` : `Invalid ${v}`;
                      }}
                      formatter={(value) => [`${value}`, "Rejected so far"]}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
                    <Line
                      type="monotone"
                      dataKey="invalid"
                      name="Invalid (rejected)"
                      stroke="#f87171"
                      strokeWidth={3}
                      dot={{ r: 5, fill: "#f87171" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
