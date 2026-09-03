"use client";

import { Loader2, Radar, ShieldAlert } from "lucide-react";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { DetectReport } from "@/lib/types";

export function SonarTheater({
  preview,
  overlay,
  busy,
  error,
  report,
}: {
  preview: string | null;
  overlay: string | null;
  busy: boolean;
  error: string | null;
  report: DetectReport | null;
}) {
  const src = overlay ?? preview;

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#031018] shadow-[0_0_80px_rgba(8,47,73,0.55)]">
      <div className="flex items-center justify-between border-b border-cyan-400/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-cyan-300" />
          </span>
          <p className="font-mono text-[11px] tracking-[0.2em] text-cyan-200 uppercase">
            SSS waterfall · live HUD
          </p>
        </div>
        <p className="font-mono text-[11px] text-amber-200/90">
          {busy ? "PING IN FLIGHT" : report ? `${report.count} CONTACTS` : "STANDBY"}
        </p>
      </div>
      {busy && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-cyan-200">
          <Loader2 className="size-4 animate-spin" />
          Speckle filter → detector → acoustic-shadow scoring → geotag
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-rose-300">
          <ShieldAlert className="size-4" />
          {error}
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_240px]">
        <div className="relative min-h-[320px] bg-black">
          {!src && !busy ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="relative">
                <span className="absolute inset-[-18px] animate-ping rounded-full border border-cyan-400/40" />
                <Radar className="size-12 text-cyan-300" />
              </div>
              <p className="max-w-sm text-sm text-sky-100/80">
                Press <span className="text-cyan-300">Run judge demo</span> or pick a real sonar
                thumbnail. Boxes, pie slices, and map pins fill from the trained YOLO11n weights.
              </p>
            </div>
          ) : (
            <>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt="Sonar detections overlay"
                  className="max-h-[560px] w-full object-contain"
                />
              ) : null}
              {busy ? <div className="scanline" /> : null}
              <div className="pointer-events-none absolute inset-3 border border-cyan-300/25">
                <span className="absolute top-0 left-0 size-4 border-t-2 border-l-2 border-cyan-300" />
                <span className="absolute top-0 right-0 size-4 border-t-2 border-r-2 border-cyan-300" />
                <span className="absolute bottom-0 left-0 size-4 border-b-2 border-l-2 border-cyan-300" />
                <span className="absolute right-0 bottom-0 size-4 border-b-2 border-r-2 border-cyan-300" />
              </div>
            </>
          )}
        </div>
        <aside className="max-h-[560px] space-y-2 overflow-y-auto border-t border-cyan-400/15 p-3 lg:border-t-0 lg:border-l">
          <p className="font-mono text-[10px] tracking-[0.18em] text-amber-200/80 uppercase">
            Contact list
          </p>
          {!report?.detections.length ? (
            <p className="text-xs text-sky-200/60">No contacts yet. Demo or upload a waterfall.</p>
          ) : (
            report.detections.map((d, i) => (
              <div
                key={d.id}
                className="rounded-lg border border-white/10 bg-white/5 p-2"
                style={{ borderLeftColor: CLASS_COLOR[d.class], borderLeftWidth: 3 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white">
                    {i + 1}. {CLASS_LABEL[d.class] ?? d.class}
                  </p>
                  <span className="font-mono text-[11px] text-cyan-200">{d.confidence.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, d.hazard_score)}%`,
                      background: CLASS_COLOR[d.class] ?? "#22d3ee",
                    }}
                  />
                </div>
                <p className="mt-1 font-mono text-[10px] text-sky-200/70">
                  hazard {d.hazard_score}
                  {d.latitude != null && d.longitude != null
                    ? ` · ${d.latitude.toFixed(4)}°N ${d.longitude.toFixed(4)}°E`
                    : ""}
                </p>
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
