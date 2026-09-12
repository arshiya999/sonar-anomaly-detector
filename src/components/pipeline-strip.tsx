"use client";

import { PIPELINE } from "@/lib/metrics";

export function PipelineStrip({
  active,
  complete,
  hint,
}: {
  active: number;
  complete: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      {hint ? (
        <p className="font-mono text-[11px] tracking-wide text-cyan-800 uppercase">{hint}</p>
      ) : null}
      <ol className="grid grid-cols-5 gap-1.5">
        {PIPELINE.map((step, i) => {
          const on = complete || i <= active;
          const current = !complete && i === active;
          return (
            <li
              key={step.id}
              className={`rounded-lg border px-2 py-2 text-center transition ${
                current
                  ? "border-cyan-600 bg-cyan-100"
                  : on
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-cyan-200 bg-white"
              }`}
            >
              <p className="font-mono text-[10px] tracking-wider text-cyan-800">0{i + 1}</p>
              <p className="text-[11px] font-medium leading-tight text-slate-800 sm:text-xs">{step.label}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
