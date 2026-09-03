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
        <p className="font-mono text-[11px] tracking-wide text-amber-200/90 uppercase">{hint}</p>
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
                ? "border-cyan-300 bg-cyan-400/25 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                : on
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-white/10 bg-black/20"
            }`}
          >
            <p className="font-mono text-[10px] tracking-wider text-cyan-200/80">0{i + 1}</p>
            <p className="text-[11px] font-medium leading-tight text-white sm:text-xs">{step.label}</p>
          </li>
        );
      })}
    </ol>
    </div>
  );
}
