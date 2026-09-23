"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import { EVAL_CLASSES, KIT_EVALUATION, VAL_EVALUATION } from "@/lib/evaluation";

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

const TICK = { fill: "#bae6fd", fontSize: 11 };
const GRID = "#155e75";

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

function OceanCard({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-4 text-cyan-50">
      <p className="font-heading text-base font-bold text-white">{title}</p>
      <p className="mb-3 text-xs text-cyan-200">{note}</p>
      {children}
    </div>
  );
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const empty = !run || run.rows.length === 0;
  const kitMatch =
    KIT_EVALUATION.n > 0 && KIT_EVALUATION.correct != null
      ? (100 * KIT_EVALUATION.correct) / KIT_EVALUATION.n
      : 0;

  const countBars = [
    { name: "Uploaded", value: stats.uploaded, fill: "#67e8f9" },
    { name: "Valid sonar", value: stats.valid, fill: "#34d399" },
    { name: "Rejected", value: stats.invalid, fill: "#f87171" },
    { name: "Analyzed", value: stats.analyzed, fill: "#38bdf8" },
    { name: "Failed", value: stats.failed, fill: "#fbbf24" },
  ];
  const rateBars = [
    { name: "Validation %", value: Number(stats.validationRate.toFixed(1)), fill: "#34d399" },
    { name: "Rejection %", value: Number(stats.rejectionRate.toFixed(1)), fill: "#f87171" },
    { name: "Analysis success %", value: Number(stats.analysisSuccessRate.toFixed(1)), fill: "#38bdf8" },
  ];
  const pieSlice = [
    { name: "Valid analyzed", value: stats.analyzed, fill: "#34d399" },
    { name: "Rejected", value: stats.invalid, fill: "#f87171" },
    { name: "Failed", value: stats.failed, fill: "#fbbf24" },
    { name: "Queued", value: Math.max(0, stats.uploaded - stats.analyzed - stats.invalid - stats.failed), fill: "#64748b" },
  ].filter((s) => s.value > 0);
  const timeBars = [
    { name: "Batch wall", value: Math.round(stats.wallMs), fill: "#22d3ee" },
    { name: "Avg wall / img", value: Math.round(stats.avgWall), fill: "#67e8f9" },
    { name: "YOLO sum", value: Math.round(stats.inferenceMs), fill: "#fbbf24" },
    { name: "Avg YOLO", value: Math.round(stats.avgInfer), fill: "#f59e0b" },
    { name: "Preprocess sum", value: Math.round(stats.preprocessMs), fill: "#a5f3fc" },
    { name: "Avg preprocess", value: Math.round(stats.avgPre), fill: "#67e8f9" },
    { name: "Postprocess sum", value: Math.round(stats.postprocessMs), fill: "#c4b5fd" },
    { name: "Avg postprocess", value: Math.round(stats.avgPost), fill: "#a78bfa" },
  ];
  const throughputBars = [
    { name: "Throughput img/s", value: Number(stats.throughput.toFixed(3)), fill: "#86efac" },
  ];
  const valBars = [
    { name: "Precision", value: Number((VAL_EVALUATION.precision * 100).toFixed(1)), fill: "#67e8f9" },
    { name: "Recall", value: Number((VAL_EVALUATION.recall * 100).toFixed(1)), fill: "#22d3ee" },
    { name: "F1", value: Number((VAL_EVALUATION.f1 * 100).toFixed(1)), fill: "#a5f3fc" },
    { name: "mAP@50", value: Number((VAL_EVALUATION.map50 * 100).toFixed(1)), fill: "#fbbf24" },
    { name: "mAP@50-95", value: Number((VAL_EVALUATION.map50_95 * 100).toFixed(1)), fill: "#f59e0b" },
    { name: "Kit match", value: Number(kitMatch.toFixed(1)), fill: "#86efac" },
    { name: "Kit P", value: Number((KIT_EVALUATION.precision * 100).toFixed(1)), fill: "#c4b5fd" },
    { name: "Kit R", value: Number((KIT_EVALUATION.recall * 100).toFixed(1)), fill: "#a78bfa" },
    { name: "Kit F1", value: Number((KIT_EVALUATION.f1 * 100).toFixed(1)), fill: "#818cf8" },
  ];
  const classBars = KIT_EVALUATION.perClass.map((row) => ({
    name: (CLASS_LABEL[row.classId] ?? row.classId).split(" ")[0],
    Precision: row.precision == null ? 0 : Number((row.precision * 100).toFixed(1)),
    Recall: row.recall == null ? 0 : Number((row.recall * 100).toFixed(1)),
    F1: row.f1 == null ? 0 : Number((row.f1 * 100).toFixed(1)),
  }));
  const confusionBars = EVAL_CLASSES.map((gt, i) => {
    const row: Record<string, string | number> = {
      name: (CLASS_LABEL[gt] ?? gt).split(" ")[0],
    };
    EVAL_CLASSES.forEach((pred, j) => {
      row[CLASS_LABEL[pred] ?? pred] = KIT_EVALUATION.confusion[i]?.[j] ?? 0;
    });
    return row;
  });

  return (
    <div id="sih-batch-results" className="space-y-4">
      {run && !run.finished ? (
        <p className="font-mono text-sm text-amber-700">
          {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
          {run.current ? ` · ${run.current}` : ""}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <OceanCard
          title="This run — counts"
          note="Uploaded, valid sonar, rejected, successfully analyzed, failed. Validation rate = valid/uploaded × 100."
        >
          {empty ? (
            <EmptyChart />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={countBars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="name" tick={TICK} interval={0} angle={-12} textAnchor="end" height={48} />
                  <YAxis allowDecimals={false} tick={TICK} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="value" name="Images" radius={[8, 8, 0, 0]} maxBarSize={56}>
                    {countBars.map((row) => (
                      <Cell key={row.name} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </OceanCard>

        <OceanCard
          title="This run — rates"
          note="Validation rate, rejection rate, analysis success (analyzed / valid × 100)."
        >
          {empty ? (
            <EmptyChart />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rateBars} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" tick={TICK} interval={0} angle={-18} textAnchor="end" height={56} />
                    <YAxis domain={[0, 100]} tick={TICK} unit="%" />
                    <Tooltip contentStyle={TOOLTIP} />
                    <Bar dataKey="value" name="%" radius={[8, 8, 0, 0]} maxBarSize={48}>
                      {rateBars.map((row) => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieSlice} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} stroke="#082f49">
                      {pieSlice.map((row) => (
                        <Cell key={row.name} fill={row.fill} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
                    <Tooltip contentStyle={TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </OceanCard>

        <OceanCard
          title="Performance (measured clocks)"
          note={`Wall ${fmtDuration(stats.wallMs)} · throughput ${stats.throughput ? `${stats.throughput.toFixed(2)} img/s` : "—"} · YOLO ${fmtDuration(stats.inferenceMs)} · preprocess ${fmtDuration(stats.preprocessMs)} · postprocess ${fmtDuration(stats.postprocessMs)}.`}
        >
          {empty ? (
            <EmptyChart />
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeBars} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="name" tick={TICK} interval={0} angle={-22} textAnchor="end" height={64} />
                  <YAxis tick={TICK} unit=" ms" />
                  <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v} ms`, "Time"]} />
                  <Bar dataKey="value" name="ms" radius={[8, 8, 0, 0]} maxBarSize={40}>
                    {timeBars.map((row) => (
                      <Cell key={row.name} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </OceanCard>

        <OceanCard title="Throughput" note="Successfully analyzed images per second of wall-clock batch time.">
          {empty ? (
            <EmptyChart />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputBars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="name" tick={TICK} />
                  <YAxis tick={TICK} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="value" name="img/s" fill="#86efac" radius={[8, 8, 0, 0]} maxBarSize={80} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </OceanCard>
      </div>

      <OceanCard
        title="Ground-truth evaluation"
        note={`${VAL_EVALUATION.source}. Kit n=${KIT_EVALUATION.n}, ${KIT_EVALUATION.correct ?? "?"} matched. F1 = 2·P·R/(P+R).`}
      >
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={valBars} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={TICK} interval={0} angle={-16} textAnchor="end" height={52} />
              <YAxis domain={[0, 100]} tick={TICK} unit="%" />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v}%`, "Score"]} />
              <Bar dataKey="value" name="%" radius={[8, 8, 0, 0]} maxBarSize={44}>
                {valBars.map((row) => (
                  <Cell key={row.name} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </OceanCard>

      <OceanCard title="Per-class precision / recall / F1 (kit)" note="Image-level vs example_class. Missing F1 plots as 0 (no score for that class).">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={classBars} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={TICK} interval={0} angle={-16} textAnchor="end" height={52} />
              <YAxis domain={[0, 100]} tick={TICK} unit="%" />
              <Tooltip contentStyle={TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#ecfeff" }} />
              <Bar dataKey="Precision" fill="#67e8f9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Recall" fill="#34d399" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </OceanCard>

      <OceanCard
        title="Confusion (kit) — stacked graph"
        note="Each column is ground truth. Coloured stacks are what the detector predicted. Not a table."
      >
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={confusionBars} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={TICK} interval={0} angle={-16} textAnchor="end" height={52} />
              <YAxis allowDecimals={false} tick={TICK} />
              <Tooltip contentStyle={TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#ecfeff" }} />
              {EVAL_CLASSES.map((c) => (
                <Bar
                  key={c}
                  dataKey={CLASS_LABEL[c] ?? c}
                  stackId="conf"
                  fill={CLASS_COLOR[c] ?? "#22d3ee"}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </OceanCard>
    </div>
  );
}

function EmptyChart() {
  return (
    <p className="grid h-[220px] place-items-center rounded-xl bg-cyan-950/50 px-4 text-center text-sm text-cyan-200">
      Add files on Upload, then Analyze. These columns fill from that run.
    </p>
  );
}
