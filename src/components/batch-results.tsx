"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_LABEL } from "@/lib/labels";
import { KIT_EVALUATION, VAL_EVALUATION } from "@/lib/evaluation";

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
  };
}

type BarRow = { name: string; value: number; fill: string; detail: string };

function bar(name: string, value: number | null, fill: string, detail: string): BarRow {
  return {
    name,
    value: value == null || !Number.isFinite(value) ? 0 : Number(value.toFixed(1)),
    fill,
    detail: value == null || !Number.isFinite(value) ? `no score · ${detail}` : detail,
  };
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const empty = !run || run.rows.length === 0;
  const kitMatch =
    KIT_EVALUATION.n > 0 && KIT_EVALUATION.correct != null
      ? (100 * KIT_EVALUATION.correct) / KIT_EVALUATION.n
      : 0;

  const bars: BarRow[] = [
    bar("Validation rate", stats.validationRate, "#34d399", `${stats.valid} valid / ${stats.uploaded} uploaded × 100`),
    bar("Rejection rate", stats.rejectionRate, "#f87171", `${stats.invalid} rejected / ${stats.uploaded} uploaded × 100`),
    bar("Analysis success", stats.analysisSuccessRate, "#38bdf8", `${stats.analyzed} analyzed / ${stats.valid} valid × 100`),
    bar("Precision (val)", VAL_EVALUATION.precision * 100, "#67e8f9", VAL_EVALUATION.source),
    bar("Recall (val)", VAL_EVALUATION.recall * 100, "#22d3ee", "126 held-out images, epoch 12"),
    bar("F1 (val)", VAL_EVALUATION.f1 * 100, "#a5f3fc", "2·P·R / (P+R) from val P and R"),
    bar("mAP@50", VAL_EVALUATION.map50 * 100, "#fbbf24", "Val boxes, IoU 0.50"),
    bar("mAP@50-95", VAL_EVALUATION.map50_95 * 100, "#f59e0b", "Val boxes, IoU 0.50–0.95"),
    bar("Kit match", kitMatch, "#86efac", `${KIT_EVALUATION.correct ?? "?"} / ${KIT_EVALUATION.n} image-level`),
    bar("Precision (kit)", KIT_EVALUATION.precision * 100, "#c4b5fd", KIT_EVALUATION.source),
    bar("Recall (kit)", KIT_EVALUATION.recall * 100, "#a78bfa", `n=${KIT_EVALUATION.n}`),
    bar("F1 (kit)", KIT_EVALUATION.f1 * 100, "#818cf8", "Macro F1 on labeled kit"),
    ...KIT_EVALUATION.perClass.flatMap((row) => {
      const label = CLASS_LABEL[row.classId] ?? row.classId;
      const n = `n=${row.support}`;
      return [
        bar(`P ${label}`, row.precision == null ? null : row.precision * 100, "#99f6e4", `kit precision · ${n}`),
        bar(`R ${label}`, row.recall == null ? null : row.recall * 100, "#5eead4", `kit recall · ${n}`),
        bar(`F1 ${label}`, row.f1 == null ? null : row.f1 * 100, "#2dd4bf", `kit F1 · ${n}`),
      ];
    }),
  ];

  const height = Math.max(480, bars.length * 28);

  return (
    <div
      id="sih-batch-results"
      className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50"
    >
      <p className="font-heading text-lg font-bold text-white">Aqua Vision — batch results</p>
      <p className="mt-1 text-xs leading-relaxed text-cyan-200">
        Counts: {stats.uploaded} uploaded · {stats.valid} valid sonar · {stats.invalid} rejected ·{" "}
        {stats.analyzed} analyzed · {stats.failed} failed. Measured times: batch {fmtDuration(stats.wallMs)} ·
        avg wall {fmtDuration(stats.avgWall)} · avg YOLO {fmtDuration(stats.avgInfer)} · avg preprocess{" "}
        {fmtDuration(stats.avgPre)} · avg postprocess {fmtDuration(stats.avgPost)} ·{" "}
        {stats.throughput ? `${stats.throughput.toFixed(2)} img/s` : "—"} · preprocess sum{" "}
        {fmtDuration(stats.preprocessMs)} · YOLO sum {fmtDuration(stats.inferenceMs)} · postprocess sum{" "}
        {fmtDuration(stats.postprocessMs)}. Graph is 0–100% only: this-run rates, val P/R/F1/mAP, kit P/R/F1,
        per-class kit P/R/F1. Screenshot this card.
      </p>

      {run && !run.finished ? (
        <p className="mt-3 font-mono text-sm text-amber-200">
          {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
          {run.current ? ` · ${run.current}` : ""}
        </p>
      ) : null}

      {empty ? (
        <p className="mt-6 rounded-xl bg-cyan-950/50 px-4 py-10 text-center text-sm text-cyan-200">
          Add files on Upload, then Analyze. This single graph fills from that run plus the stored val/kit scores.
        </p>
      ) : (
        <div className="mt-4" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ top: 8, right: 28, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "#bae6fd", fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="name" width={132} tick={{ fill: "#ecfeff", fontSize: 10 }} />
              <Tooltip
                contentStyle={TOOLTIP}
                formatter={(value, _n, item) => {
                  const row = item?.payload as BarRow | undefined;
                  return [`${value}% · ${row?.detail ?? ""}`, "Score"];
                }}
              />
              <Bar dataKey="value" name="%" radius={[0, 6, 6, 0]} maxBarSize={18}>
                {bars.map((row) => (
                  <Cell key={row.name} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
