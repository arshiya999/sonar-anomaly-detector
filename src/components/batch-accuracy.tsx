"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CLASS_LABEL } from "@/lib/labels";
import type { Verdict } from "@/lib/score-image";

export type BatchRow = {
  id: string;
  filename: string;
  expected: string | null;
  predicted: string | null;
  labelled: boolean;
  verdict: Verdict;
  count: number;
  inference_ms: number;
  length_m: number | null;
  width_m: number | null;
};

export type BatchRun = {
  total: number;
  done: number;
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

export function summarizeBatch(run: BatchRun | null) {
  const rows = run?.rows ?? [];
  const correct = rows.filter((r) => r.verdict === "correct").length;
  const incorrect = rows.filter((r) => r.verdict === "incorrect").length;
  const labelled = rows.filter((r) => r.labelled).length;
  const inferenceMs = rows.reduce((s, r) => s + r.inference_ms, 0);
  const sizes = rows.flatMap((r) => {
    const out: number[] = [];
    if (r.length_m && r.length_m > 0) out.push(r.length_m);
    if (r.width_m && r.width_m > 0) out.push(r.width_m);
    return out;
  });
  const meanSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
  const scored = correct + incorrect;
  const accuracy = scored ? (100 * correct) / scored : 0;
  return {
    images: rows.length,
    correct,
    incorrect,
    labelled,
    inferenceMs,
    wallMs: run?.elapsedMs ?? 0,
    meanSize,
    accuracy,
  };
}

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m} min ${rem.toFixed(0)} s`;
}

export function BatchAccuracyPoster({
  run,
  onMark,
}: {
  run: BatchRun | null;
  onMark?: (id: string, verdict: Verdict) => void;
}) {
  const stats = summarizeBatch(run);
  const bars = [
    { key: "correct", label: "Identified correctly", value: stats.correct, fill: "#34d399" },
    { key: "incorrect", label: "Not correctly identified", value: stats.incorrect, fill: "#f87171" },
  ];
  const empty = !run || run.rows.length === 0;

  return (
    <div
      id="sih-accuracy-poster"
      className="overflow-hidden rounded-2xl border border-cyan-700 bg-[#082f49] p-5 text-cyan-50 shadow-inner"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-heading text-lg font-bold tracking-tight text-white">Batch accuracy — SIH 26057</p>
          <p className="text-xs text-cyan-200">
            Screenshot this card for the PPT. Known sample names are scored by class match; other files score as
            contact found vs no contact. Tap a row to override.
          </p>
        </div>
        {run && !run.finished ? (
          <p className="font-mono text-sm text-amber-200">
            Scanning {run.done}/{run.total}
            {run.current ? ` · ${run.current}` : ""}
          </p>
        ) : null}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat k="Total images" v={empty ? "0" : String(stats.images)} d="Files in this batch" />
        <Stat k="Total analysis time" v={fmtDuration(stats.wallMs)} d="Wall clock for the whole batch" />
        <Stat k="Model time" v={fmtDuration(stats.inferenceMs)} d="Sum of YOLO inference_ms" />
        <Stat
          k="Accuracy"
          v={empty ? "—" : `${stats.accuracy.toFixed(1)}%`}
          d={`${stats.correct} correct · ${stats.incorrect} not correct`}
        />
        <Stat
          k="Mean size"
          v={stats.meanSize ? `${stats.meanSize.toFixed(2)} m` : "—"}
          d="Average boxed length / width"
        />
      </div>

      {empty ? (
        <p className="rounded-xl bg-cyan-950/50 px-4 py-10 text-center text-sm text-cyan-200">
          Select many sonar images on Upload. This graph fills when the batch finishes.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#155e75" />
            <XAxis dataKey="label" tick={{ fill: "#bae6fd", fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fill: "#bae6fd", fontSize: 11 }} />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar dataKey="value" name="Images" radius={[8, 8, 0, 0]} maxBarSize={88}>
              {bars.map((row) => (
                <Cell key={row.key} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {run && run.rows.length > 0 ? (
        <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-cyan-800/80">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0c4a6e] text-cyan-100">
              <tr>
                <th className="px-3 py-2 font-medium">Image</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Predicted</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {run.rows.map((row) => (
                <tr key={row.id} className="border-t border-cyan-900/80">
                  <td className="max-w-[180px] truncate px-3 py-1.5 font-mono">{row.filename}</td>
                  <td className="px-3 py-1.5">{row.expected ? CLASS_LABEL[row.expected] ?? row.expected : "—"}</td>
                  <td className="px-3 py-1.5">{row.predicted ? CLASS_LABEL[row.predicted] ?? row.predicted : "none"}</td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        row.verdict === "correct" ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
                      }`}
                      onClick={() =>
                        onMark?.(row.id, row.verdict === "correct" ? "incorrect" : "correct")
                      }
                      title="Tap to override for the PPT count"
                    >
                      {row.verdict === "correct" ? "Correct" : "Not correct"}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {row.length_m != null && row.width_m != null
                      ? `${row.length_m.toFixed(2)} × ${row.width_m.toFixed(2)} m`
                      : "—"}
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
