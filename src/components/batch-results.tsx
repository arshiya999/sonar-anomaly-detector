"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
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
  background: "linear-gradient(180deg, #083344 0%, #0c4a6e 100%)",
  border: "1px solid #5eead4",
  borderRadius: 12,
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

function dividedSeries(run: BatchRun | null) {
  const rows = run?.rows ?? [];
  const validRows = rows.filter((r) => r.status !== "invalid");
  const invalidRows = rows.filter((r) => r.status === "invalid");
  const ordered = [...validRows, ...invalidRows];
  let valid = 0;
  let identified = 0;
  let failed = 0;
  let invalid = 0;
  const points = ordered.map((row, idx) => {
    const isInvalid = row.status === "invalid";
    if (isInvalid) invalid += 1;
    else valid += 1;
    if (row.status === "analyzed") identified += 1;
    if (row.status === "failed") failed += 1;
    return {
      i: idx + 1,
      name: row.filename,
      half: isInvalid ? "invalid" : "valid",
      valid,
      identified,
      failed,
      invalid,
      latency: isInvalid ? null : row.wall_ms || row.inference_ms || 0,
    };
  });
  return { points, split: validRows.length, invalidN: invalidRows.length, validN: validRows.length };
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const { points, split, invalidN, validN } = dividedSeries(run);
  const empty = !run || run.rows.length === 0;
  const xMax = Math.max(points.length, 1);

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
      className="overflow-hidden rounded-2xl border border-cyan-400/40 p-5 text-cyan-50 shadow-[inset_0_1px_0_rgba(165,243,252,0.25)]"
      style={{
        background:
          "radial-gradient(1200px 400px at 10% -10%, rgba(45,212,191,0.22), transparent 50%), radial-gradient(800px 320px at 100% 0%, rgba(56,189,248,0.18), transparent 45%), linear-gradient(180deg, #042f2e 0%, #0c4a6e 55%, #082f49 100%)",
      }}
    >
      <p className="font-heading text-xl font-bold text-white">Batch results</p>
      <p className="mt-1 text-xs text-cyan-200">
        One X–Y graph, two halves. Green left = valid sonar. Red right = colour photos (tiger etc.) rejected
        before YOLO. Latency (ms) uses the right axis because it is not a count.
      </p>

      {run && !run.finished ? (
        <p className="mt-3 font-mono text-sm text-amber-200">
          {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
          {run.current ? ` · ${run.current}` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.k} className="rounded-xl border border-teal-200/30 bg-cyan-950/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(165,243,252,0.2)]">
            <p className="text-[10px] tracking-wide text-cyan-300 uppercase">{c.k}</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{c.v}</p>
            <p className="text-[11px] text-cyan-200/80">{c.d}</p>
          </div>
        ))}
      </div>

      {empty ? (
        <p className="mt-6 rounded-xl bg-cyan-950/50 px-4 py-12 text-center text-sm text-cyan-200">
          Add files on Upload, then Analyze. Put sonar and a colour photo in the same run to see both halves.
        </p>
      ) : (
        <div className="mt-5 rounded-xl border border-cyan-300/20 bg-[#023047]/50 p-3 shadow-inner">
          <div className="mb-2 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">
              Left · valid sonar ({validN})
            </span>
            <span className="rounded-full bg-rose-500/20 px-3 py-1 text-rose-200">
              Right · invalid / not sonar ({invalidN})
            </span>
          </div>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 36, right: 44, left: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="#155e75" strokeOpacity={0.65} />
                {split > 0 ? (
                  <ReferenceArea yAxisId="left" x1={0.5} x2={split + 0.5} fill="#2dd4bf" fillOpacity={0.12} />
                ) : null}
                {invalidN > 0 ? (
                  <ReferenceArea yAxisId="left" x1={split + 0.5} x2={xMax + 0.5} fill="#67e8f9" fillOpacity={0.08} />
                ) : null}
                {split > 0 && invalidN > 0 ? (
                  <ReferenceLine
                    yAxisId="left"
                    x={split + 0.5}
                    stroke="#99f6e4"
                    strokeDasharray="4 3"
                    label={{ value: "valid | invalid", fill: "#ccfbf1", fontSize: 11, position: "insideTopRight" }}
                  />
                ) : null}
                <XAxis
                  dataKey="i"
                  tick={{ fill: "#a5f3fc", fontSize: 11 }}
                  tickFormatter={(v) => (v <= split ? `V${v}` : `I${v - split}`)}
                  axisLine={{ stroke: "#5eead4" }}
                  tickLine={{ stroke: "#5eead4" }}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fill: "#99f6e4", fontSize: 11 }}
                  axisLine={{ stroke: "#5eead4" }}
                  label={{ value: "Cumulative count", angle: -90, position: "insideLeft", fill: "#5eead4" }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#a5f3fc", fontSize: 11 }}
                  axisLine={{ stroke: "#67e8f9" }}
                  label={{ value: "Latency (ms)", angle: 90, position: "insideRight", fill: "#67e8f9" }}
                />
                <Tooltip
                  contentStyle={TOOLTIP}
                  labelFormatter={(v, pts) => {
                    const row = pts?.[0]?.payload as { name?: string; half?: string } | undefined;
                    const side = row?.half === "invalid" ? "Invalid" : "Valid";
                    return row?.name ? `${side} · ${row.name}` : `${side} ${v}`;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ fontSize: 12, color: "#ecfeff", paddingBottom: 8 }}
                />
                <Line yAxisId="left" type="monotone" dataKey="valid" name="Valid sonar" stroke="#5eead4" strokeWidth={2.8} dot={{ r: 3, fill: "#99f6e4" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="identified"
                  name="Successfully identified"
                  stroke="#38bdf8"
                  strokeWidth={2.6}
                  dot={{ r: 3, fill: "#7dd3fc" }}
                />
                <Line yAxisId="left" type="monotone" dataKey="failed" name="Failed" stroke="#67e8f9" strokeWidth={2} dot={false} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="invalid"
                  name="Invalid (not sonar)"
                  stroke="#fb7185"
                  strokeWidth={2.8}
                  dot={{ r: 4, fill: "#fda4af" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="latency"
                  name="Latency (ms)"
                  stroke="#a5f3fc"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-2 text-center text-[11px] text-cyan-200">
            <p>Valid image number (V1, V2…)</p>
            <p>Invalid image number (I1, I2…) — tiger / colour photos</p>
          </div>
          {invalidN === 0 ? (
            <p className="mt-2 text-center text-xs text-rose-200">
              Invalid half is empty this run. Add a colour photo with the sonar files so the red half climbs.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
