"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  sure_pct?: number;
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

function paddedDomain(values: number[], pad = 0.18): [number, number] {
  const nums = values.filter((n) => Number.isFinite(n));
  if (!nums.length) return [0, 1];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  if (hi === lo) {
    const step = Math.max(2, Math.abs(hi) * 0.15);
    return [lo - step, hi + step];
  }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
}

function niceDomain(values: number[]): [number, number] {
  const [lo, hi] = paddedDomain(values);
  return [Math.floor(lo), Math.ceil(hi)];
}

function tickInt(v: number): string {
  if (!Number.isFinite(v)) return "";
  return String(Math.round(v));
}

function validSeries(run: BatchRun | null) {
  const rows = (run?.rows ?? []).filter((r) => r.status !== "invalid");
  return rows.map((row, idx) => ({
    i: idx + 1,
    name: row.filename,
    sure: row.sure_pct ?? 0,
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
    cameraLook: Math.round(((row.colour_pct ?? 0) + (row.colour_busy ?? 0)) / 2),
    rejectMs: Math.max(row.check_ms || 0, 1),
    reason: row.reason ?? "Not side-scan sonar",
  }));
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const valid = validSeries(run);
  const invalid = invalidSeries(run);
  const empty = !run || run.rows.length === 0;
  const sureDomain = niceDomain(valid.map((r) => r.sure));
  const tookDomain = niceDomain(valid.map((r) => r.tookMs));
  const camDomain = niceDomain(invalid.map((r) => r.cameraLook));
  const rejDomain = niceDomain(invalid.map((r) => r.rejectMs));

  const cards: { k: string; v: string; d: string }[] = [
    { k: "Analysed", v: String(stats.analyzed), d: "Accepted sonar frames" },
    { k: "Contacts", v: String(stats.detections), d: "Debris objects in this batch" },
    { k: "Elapsed time", v: fmtDuration(stats.wallMs), d: "End-to-end duration" },
    { k: "Throughput", v: stats.throughput ? `${stats.throughput.toFixed(2)} img/s` : "—", d: "Frames processed per second" },
    { k: "Precision", v: fmtScore(VAL_EVALUATION.precision), d: "Validation set" },
    { k: "mAP@50", v: fmtScore(VAL_EVALUATION.map50), d: "Validation boxes" },
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
      <p className="font-heading text-xl font-bold text-white drop-shadow">Batch assessment</p>
      <p className="mt-1 text-xs font-medium text-cyan-50">
        MoES · NIOT operator view — two traces per panel: filled series (result) and dashed series (time).
      </p>

      {run && !run.finished ? (
        <p className="mt-3 font-mono text-sm text-yellow-200">
          {run.phase === "validate" ? "Validating imagery" : "Running inference"} · {run.done} of {run.total}
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
          Add sonar frames on Upload, then run analysis. Include an RGB photograph to populate the rejection panel.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border-2 border-cyan-500/70 bg-[#012a4a]/85 p-3 shadow-inner">
            <p className="text-sm font-semibold tracking-wide text-cyan-50">Accepted side-scan frames</p>
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-cyan-100">
              <li>Filled series — detection confidence that this frame contains debris.</li>
              <li>Dashed series — processing time for this frame (ms).</li>
            </ul>
            {valid.length === 0 ? (
              <p className="grid h-[300px] place-items-center text-sm text-cyan-100">No accepted sonar frames in this run.</p>
            ) : (
              <div className="flex h-[320px] gap-1">
                <p
                  className="w-4 shrink-0 self-center text-center text-[10px] font-medium tracking-wide text-cyan-200"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  Confidence (%)
                </p>
                <div className="min-w-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={valid} margin={{ top: 36, right: 8, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 6" stroke="#0077b6" strokeOpacity={0.55} />
                      <XAxis dataKey="i" tick={{ fill: "#90e0ef", fontSize: 11 }} axisLine={{ stroke: "#0096c7" }} />
                      <YAxis yAxisId="left" domain={sureDomain} width={36} tickFormatter={tickInt} tick={{ fill: "#90e0ef", fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" domain={tookDomain} width={40} tickFormatter={tickInt} tick={{ fill: "#fde68a", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={TOOLTIP}
                        labelFormatter={(v, pts) => {
                          const name = (pts?.[0]?.payload as { name?: string } | undefined)?.name;
                          return name ? `Frame ${v} · ${name}` : `Frame ${v}`;
                        }}
                      />
                      <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
                      <Area yAxisId="left" type="linear" dataKey="sure" name="Confidence (%)" stroke="#00f5d4" fill="#00f5d4" fillOpacity={0.22} strokeWidth={2.8} dot={{ r: 3, fill: "#80ffdb" }} />
                      <Line yAxisId="right" type="linear" dataKey="tookMs" name="Processing time (ms)" stroke="#48cae4" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 3, fill: "#90e0ef" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="w-4 shrink-0 self-center text-center text-[10px] font-medium tracking-wide text-amber-200" style={{ writingMode: "vertical-rl" }}>
                  Latency (ms)
                </p>
              </div>
            )}
            <p className="mt-1 text-center text-[11px] font-medium tracking-wide text-cyan-50">Frame index</p>
          </div>

          <div className="overflow-hidden rounded-2xl border-2 border-cyan-500/70 bg-[#012a4a]/85 p-3 shadow-inner">
            <p className="text-sm font-semibold tracking-wide text-cyan-50">Rejected non-sonar imagery</p>
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-cyan-100">
              <li>Filled series — RGB photograph likelihood (higher = ordinary camera image, held back from the detector).</li>
              <li>Dashed series — pre-filter screening time (ms).</li>
            </ul>
            {invalid.length === 0 ? (
              <p className="grid h-[300px] place-items-center px-4 text-center text-sm text-cyan-100">
                No rejected imagery in this run. Include an RGB photograph with the sonar set to populate this panel.
              </p>
            ) : (
              <div className="flex h-[320px] gap-1">
                <p
                  className="w-4 shrink-0 self-center text-center text-[10px] font-medium tracking-wide text-cyan-200"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  RGB score
                </p>
                <div className="min-w-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={invalid} margin={{ top: 36, right: 8, left: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 6" stroke="#0077b6" strokeOpacity={0.55} />
                      <XAxis dataKey="i" tick={{ fill: "#90e0ef", fontSize: 11 }} axisLine={{ stroke: "#0096c7" }} />
                      <YAxis yAxisId="left" domain={camDomain} width={36} tickFormatter={tickInt} tick={{ fill: "#90e0ef", fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" domain={rejDomain} width={40} tickFormatter={tickInt} tick={{ fill: "#fde68a", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={TOOLTIP}
                        labelFormatter={(v, pts) => {
                          const row = pts?.[0]?.payload as { name?: string } | undefined;
                          return row?.name ? `Rejected frame ${v} · ${row.name}` : `Rejected frame ${v}`;
                        }}
                      />
                      <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
                      <Area yAxisId="left" type="linear" dataKey="cameraLook" name="RGB score" stroke="#00f5d4" fill="#00f5d4" fillOpacity={0.22} strokeWidth={2.8} dot={{ r: 3, fill: "#80ffdb" }} />
                      <Line yAxisId="right" type="linear" dataKey="rejectMs" name="Screening time (ms)" stroke="#48cae4" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 3, fill: "#90e0ef" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="w-4 shrink-0 self-center text-center text-[10px] font-medium text-amber-200" style={{ writingMode: "vertical-rl" }}>
                  Time (ms)
                </p>
              </div>
            )}
            <p className="mt-1 text-center text-[11px] font-medium text-cyan-50">Rejected picture number</p>
          </div>
        </div>
      )}
    </div>
  );
}
