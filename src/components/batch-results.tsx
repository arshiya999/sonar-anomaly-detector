"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_LABEL } from "@/lib/labels";
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

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${(s - m * 60).toFixed(0)} s`;
}

function pct(num: number, den: number): string {
  if (!den) return "—";
  return `${((100 * num) / den).toFixed(1)}%`;
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

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const empty = !run || run.rows.length === 0;
  const validationBars = [
    { label: "Uploaded", value: stats.uploaded, fill: "#67e8f9" },
    { label: "Valid sonar", value: stats.valid, fill: "#34d399" },
    { label: "Rejected", value: stats.invalid, fill: "#f87171" },
  ];
  const pipelineBars = [
    { label: "Valid sonar", value: stats.valid, fill: "#22d3ee" },
    { label: "Analyzed", value: stats.analyzed, fill: "#34d399" },
    { label: "Failed", value: stats.failed, fill: "#fbbf24" },
  ];
  const rateBars = [
    { label: "Validation rate", value: Number(stats.validationRate.toFixed(1)), fill: "#34d399" },
    { label: "Rejection rate", value: Number(stats.rejectionRate.toFixed(1)), fill: "#f87171" },
    { label: "Analysis success", value: Number(stats.analysisSuccessRate.toFixed(1)), fill: "#38bdf8" },
  ];
  const timeBars = [
    { label: "Preprocess (sum)", value: Math.round(stats.preprocessMs), fill: "#67e8f9" },
    { label: "YOLO (sum)", value: Math.round(stats.inferenceMs), fill: "#22d3ee" },
    { label: "Postprocess (sum)", value: Math.round(stats.postprocessMs), fill: "#a78bfa" },
  ];
  const valRadar = [
    { metric: "Precision", value: Number((VAL_EVALUATION.precision * 100).toFixed(1)) },
    { metric: "Recall", value: Number((VAL_EVALUATION.recall * 100).toFixed(1)) },
    { metric: "F1", value: Number((VAL_EVALUATION.f1 * 100).toFixed(1)) },
    { metric: "mAP@50", value: Number((VAL_EVALUATION.map50 * 100).toFixed(1)) },
    { metric: "mAP@50-95", value: Number((VAL_EVALUATION.map50_95 * 100).toFixed(1)) },
  ];
  const kitClassBars = KIT_EVALUATION.perClass.map((row) => ({
    label: CLASS_LABEL[row.classId] ?? row.classId,
    precision: row.precision == null ? 0 : Number((row.precision * 100).toFixed(1)),
    recall: row.recall == null ? 0 : Number((row.recall * 100).toFixed(1)),
    f1: row.f1 == null ? 0 : Number((row.f1 * 100).toFixed(1)),
  }));

  return (
    <div id="sih-batch-results" className="space-y-4">
      <Section title="Input validation (this run)" note="Counts and rates are from the files you just added. Validation rate = valid sonar / uploaded × 100. Rejection rate = rejected / uploaded × 100.">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat k="Total uploaded" v={String(stats.uploaded)} d="Files in this run" />
          <Stat k="Valid sonar" v={String(stats.valid)} d="Passed sonar check" />
          <Stat k="Rejected / invalid" v={String(stats.invalid)} d="Not sonar or unreadable" />
          <Stat k="Validation rate" v={pct(stats.valid, stats.uploaded)} d="valid / uploaded × 100" />
          <Stat k="Rejection rate" v={pct(stats.invalid, stats.uploaded)} d="rejected / uploaded × 100" />
        </div>
        {empty ? (
          <Empty />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <MiniChart data={validationBars} unit="images" />
            <MiniChart data={rateBars} unit="%" />
          </div>
        )}
      </Section>

      <Section title="Pipeline processing (this run)" note="Analysis success rate = successfully analyzed / valid sonar × 100. Failed means the detector did not return a report.">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat k="Valid sonar" v={String(stats.valid)} d="Sent toward YOLO" />
          <Stat k="Successfully analyzed" v={String(stats.analyzed)} d="Report returned" />
          <Stat k="Failed analysis" v={String(stats.failed)} d="No report" />
          <Stat k="Analysis success rate" v={pct(stats.analyzed, stats.valid)} d="analyzed / valid × 100" />
        </div>
        {empty ? <Empty /> : <MiniChart data={pipelineBars} unit="images" />}
      </Section>

      <Section
        title="Performance (measured)"
        note="Wall clock is the real batch timer. Preprocess / YOLO / postprocess come from the detector clocks on each analyzed frame. Throughput = successfully analyzed / total batch seconds."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat k="Total batch time" v={fmtDuration(stats.wallMs)} d="Wall clock for this run" />
          <Stat k="Avg wall / image" v={fmtDuration(stats.avgWall)} d="Among analyzed frames" />
          <Stat
            k="Throughput"
            v={stats.throughput ? `${stats.throughput.toFixed(2)} img/s` : "—"}
            d="Analyzed / batch seconds"
          />
          <Stat k="YOLO time (sum)" v={fmtDuration(stats.inferenceMs)} d="Model predict only" />
          <Stat k="Avg YOLO / image" v={fmtDuration(stats.avgInfer)} d="Mean inference_ms" />
          <Stat k="Preprocess (sum)" v={fmtDuration(stats.preprocessMs)} d="Lee + CLAHE, measured" />
          <Stat k="Avg preprocess" v={fmtDuration(stats.avgPre)} d="Mean preprocess_ms" />
          <Stat k="Postprocess (sum)" v={fmtDuration(stats.postprocessMs)} d="Fusion + NMS + geotag" />
        </div>
        {empty ? <Empty /> : <MiniChart data={timeBars} unit="ms" />}
      </Section>

      <Section
        title="Model evaluation on ground truth"
        note={`${VAL_EVALUATION.source}. F1 = 2·P·R/(P+R) from that same val row. Per-class scores and the confusion matrix are a separate image-level run on the labeled operator kit (n=${KIT_EVALUATION.n}), not invented batch accuracy.`}
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat k="Precision" v={fmtScore(VAL_EVALUATION.precision)} d="Val set P" />
          <Stat k="Recall" v={fmtScore(VAL_EVALUATION.recall)} d="Val set R" />
          <Stat k="F1" v={fmtScore(VAL_EVALUATION.f1)} d="2PR/(P+R) from val P,R" />
          <Stat k="mAP@50" v={fmtScore(VAL_EVALUATION.map50)} d="Val boxes IoU 0.50" />
          <Stat k="mAP@50-95" v={fmtScore(VAL_EVALUATION.map50_95)} d="Val boxes IoU 0.50–0.95" />
        </div>
        <div className="mb-6 h-[280px]">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={valRadar}>
              <PolarGrid stroke="#155e75" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: "#bae6fd", fontSize: 11 }} />
              <Radar name="Val %" dataKey="value" stroke="#67e8f9" fill="#22d3ee" fillOpacity={0.35} />
              <Tooltip contentStyle={TOOLTIP} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <p className="mb-2 text-xs text-cyan-200">
          Kit check (n={KIT_EVALUATION.n}): image-level vs example_class — {KIT_EVALUATION.correct ?? "?"} / {KIT_EVALUATION.n} matched.
          Macro P {fmtScore(KIT_EVALUATION.precision)} · R {fmtScore(KIT_EVALUATION.recall)} · F1 {fmtScore(KIT_EVALUATION.f1)}.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={kitClassBars} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
            <XAxis dataKey="label" tick={{ fill: "#bae6fd", fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={56} />
            <YAxis tick={{ fill: "#bae6fd", fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar dataKey="precision" name="Precision %" fill="#67e8f9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="recall" name="Recall %" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Bar dataKey="f1" name="F1 %" fill="#fbbf24" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-4 mb-2 text-xs text-cyan-200">Confusion matrix (rows = ground truth, columns = predicted) — kit run.</p>
        <div className="overflow-auto">
          <table className="text-center font-mono text-[10px] text-cyan-50">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-cyan-300">GT \ Pred</th>
                {EVAL_CLASSES.map((c) => (
                  <th key={c} className="px-1 py-1 font-normal">
                    {(CLASS_LABEL[c] ?? c).split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVAL_CLASSES.map((gt, i) => (
                <tr key={gt}>
                  <td className="px-1 py-1 text-left text-cyan-200">{CLASS_LABEL[gt] ?? gt}</td>
                  {EVAL_CLASSES.map((pred, j) => {
                    const n = KIT_EVALUATION.confusion[i]?.[j] ?? 0;
                    return (
                      <td
                        key={pred}
                        className="px-1 py-1"
                        style={{
                          background:
                            n === 0 ? "transparent" : i === j ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)",
                        }}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 overflow-auto rounded-lg border border-cyan-800">
          <table className="w-full text-left text-xs">
            <thead className="text-cyan-200">
              <tr>
                <th className="px-2 py-1">Class</th>
                <th className="px-2 py-1">Support</th>
                <th className="px-2 py-1">Precision</th>
                <th className="px-2 py-1">Recall</th>
                <th className="px-2 py-1">F1</th>
              </tr>
            </thead>
            <tbody>
              {KIT_EVALUATION.perClass.map((row) => (
                <tr key={row.classId} className="border-t border-cyan-900">
                  <td className="px-2 py-1">{CLASS_LABEL[row.classId] ?? row.classId}</td>
                  <td className="px-2 py-1 font-mono">{row.support}</td>
                  <td className="px-2 py-1 font-mono">{fmtScore(row.precision)}</td>
                  <td className="px-2 py-1 font-mono">{fmtScore(row.recall)}</td>
                  <td className="px-2 py-1 font-mono">{fmtScore(row.f1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {run && run.rows.length > 0 ? (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Valid / invalid</th>
                <th className="px-3 py-2 font-medium">Why</th>
                <th className="px-3 py-2 font-medium">Top class</th>
                <th className="px-3 py-2 font-medium">Pre ms</th>
                <th className="px-3 py-2 font-medium">YOLO ms</th>
                <th className="px-3 py-2 font-medium">Post ms</th>
              </tr>
            </thead>
            <tbody>
              {run.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-xs">{row.filename}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "invalid"
                          ? "bg-rose-100 text-rose-800"
                          : row.status === "failed"
                            ? "bg-amber-100 text-amber-900"
                            : row.status === "analyzed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {row.status === "invalid"
                        ? "Invalid"
                        : row.status === "failed"
                          ? "Failed"
                          : row.status === "analyzed"
                            ? "Valid · analyzed"
                            : row.status}
                    </span>
                  </td>
                  <td className="max-w-[280px] px-3 py-1.5 text-xs text-slate-600">{row.reason ?? "—"}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {row.predicted ? CLASS_LABEL[row.predicted] ?? row.predicted : "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{row.preprocess_ms || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{row.inference_ms || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{row.postprocess_ms || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50">
      <p className="font-heading text-lg font-bold text-white">{title}</p>
      <p className="mb-4 text-xs text-cyan-200">{note}</p>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <p className="rounded-xl bg-cyan-950/50 px-4 py-8 text-center text-sm text-cyan-200">
      Add files on Upload, then Analyze. These numbers fill from that run.
    </p>
  );
}

function MiniChart({ data, unit }: { data: { label: string; value: number; fill: string }[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
        <XAxis dataKey="label" tick={{ fill: "#bae6fd", fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fill: "#bae6fd", fontSize: 11 }} unit={unit === "images" ? "" : unit === "ms" ? "" : ""} />
        <Tooltip contentStyle={TOOLTIP} />
        <Bar dataKey="value" name={unit} radius={[8, 8, 0, 0]} maxBarSize={72}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Stat({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="rounded-xl border border-cyan-700/80 bg-cyan-950/40 px-3 py-2">
      <p className="text-[10px] tracking-wide text-cyan-300 uppercase">{k}</p>
      <p className="mt-0.5 text-lg font-semibold text-white">{v}</p>
      <p className="text-[11px] text-cyan-200/80">{d}</p>
    </div>
  );
}
