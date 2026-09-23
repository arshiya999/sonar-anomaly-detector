"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CLASS_LABEL } from "@/lib/labels";

export type BatchStatus = "queued" | "invalid" | "analyzed" | "failed";

export type BatchRow = {
  id: string;
  filename: string;
  status: BatchStatus;
  reason?: string;
  predicted: string | null;
  count: number;
  inference_ms: number;
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
  const inferenceMs = rows.reduce((s, r) => s + (r.inference_ms || 0), 0);
  const analyzed = rows.filter((r) => r.status === "analyzed");
  const avgWall = analyzed.length
    ? analyzed.reduce((s, r) => s + r.wall_ms, 0) / analyzed.length
    : 0;
  const avgInfer = analyzed.length
    ? analyzed.reduce((s, r) => s + r.inference_ms, 0) / analyzed.length
    : 0;
  const classes: Record<string, number> = {};
  for (const r of analyzed) {
    if (r.predicted) classes[r.predicted] = (classes[r.predicted] ?? 0) + 1;
  }
  return {
    uploaded: run?.uploaded ?? rows.length,
    valid: run?.valid ?? rows.filter((r) => r.status !== "invalid").length,
    invalid: run?.invalid ?? rows.filter((r) => r.status === "invalid").length,
    analyzed: analyzed.length,
    failed: run?.failed ?? rows.filter((r) => r.status === "failed").length,
    inferenceMs,
    wallMs: run?.elapsedMs ?? 0,
    avgWall,
    avgInfer,
    classes,
  };
}

export function BatchResultsPanel({ run }: { run: BatchRun | null }) {
  const stats = summarizeBatch(run);
  const mix = [
    { key: "valid", label: "Valid sonar", value: stats.valid, fill: "#34d399" },
    { key: "invalid", label: "Invalid / rejected", value: stats.invalid, fill: "#f87171" },
  ];
  const empty = !run || run.rows.length === 0;

  return (
    <div id="sih-batch-results" className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-heading text-lg font-bold text-white">Batch results</p>
            <p className="text-xs text-cyan-200">
              Times are wall-clock measurements from this run — not a claimed instant score. Invalid files never
              go to YOLO.
            </p>
          </div>
          {run && !run.finished ? (
            <p className="font-mono text-sm text-amber-200">
              {run.phase === "validate" ? "Checking files" : "Analyzing"} · {run.done} of {run.total}
              {run.current ? ` · ${run.current}` : ""}
            </p>
          ) : null}
        </div>

        {run && !run.finished ? (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-cyan-200">
              <span>{run.done} of {run.total}</span>
              <span>{run.total ? Math.round((100 * run.done) / run.total) : 0}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-cyan-950">
              <div
                className="h-full bg-cyan-400 transition-all"
                style={{ width: `${run.total ? (100 * run.done) / run.total : 0}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat k="Uploaded" v={String(stats.uploaded)} d="Files you added" />
          <Stat k="Valid sonar" v={String(stats.valid)} d="Readable side-scan frames" />
          <Stat k="Rejected" v={String(stats.invalid)} d="Not sonar / unreadable" />
          <Stat k="Analyzed" v={String(stats.analyzed)} d={`Failed ${stats.failed}`} />
          <Stat k="Total time" v={fmtDuration(stats.wallMs)} d="Measured wall clock" />
          <Stat k="Average / image" v={fmtDuration(stats.avgWall)} d="Wall time among analyzed" />
          <Stat k="Model time (sum)" v={fmtDuration(stats.inferenceMs)} d="Backend inference_ms if returned" />
          <Stat k="Model time (avg)" v={fmtDuration(stats.avgInfer)} d="Mean inference_ms" />
        </div>

        {empty ? (
          <p className="rounded-xl bg-cyan-950/50 px-4 py-10 text-center text-sm text-cyan-200">
            Add files on Upload, then Analyze. This page fills when the run finishes.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={mix} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
              <XAxis dataKey="label" tick={{ fill: "#bae6fd", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#bae6fd", fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP} />
              <Bar dataKey="value" name="Images" radius={[8, 8, 0, 0]} maxBarSize={96}>
                {mix.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {run && run.rows.length > 0 ? (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Valid / invalid</th>
                <th className="px-3 py-2 font-medium">Why</th>
                <th className="px-3 py-2 font-medium">Top class</th>
                <th className="px-3 py-2 font-medium">Contacts</th>
                <th className="px-3 py-2 font-medium">Model ms</th>
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
                  <td className="px-3 py-1.5 font-mono text-xs">{row.status === "analyzed" ? row.count : "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">
                    {row.inference_ms ? Math.round(row.inference_ms) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
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
