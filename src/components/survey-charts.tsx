"use client";

import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { ScanLogEntry } from "@/lib/types";

export function SurveyCharts({ entries }: { entries: ScanLogEntry[] }) {
  const byClass: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  for (const e of entries) {
    const hour = e.at.slice(0, 13) + ":00";
    byHour[hour] = (byHour[hour] ?? 0) + 1;
    for (const d of e.detections) {
      byClass[d.class] = (byClass[d.class] ?? 0) + 1;
    }
  }
  const classRows = Object.entries(byClass).sort((a, b) => b[1] - a[1]);
  const hourRows = Object.entries(byHour).slice(-8);
  const maxClass = Math.max(1, ...classRows.map(([, n]) => n));
  const maxHour = Math.max(1, ...hourRows.map(([, n]) => n));
  const totalHits = classRows.reduce((s, [, n]) => s + n, 0);

  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No scans recorded yet. Upload an image or click a sample — each run is logged.
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="mb-3 text-xs tracking-wide text-muted-foreground uppercase">
          Hazards by class ({totalHits})
        </p>
        <div className="space-y-2">
          {classRows.map(([cls, n]) => (
            <div key={cls} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs">
              <span className="truncate">{CLASS_LABEL[cls] ?? cls}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(n / maxClass) * 100}%`,
                    background: CLASS_COLOR[cls] ?? "#5eead4",
                  }}
                />
              </div>
              <span className="font-mono text-right">{n}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs tracking-wide text-muted-foreground uppercase">
          Images entered (by hour)
        </p>
        <div className="flex h-36 items-end gap-1.5">
          {hourRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Waiting for the first scan.</p>
          ) : (
            hourRows.map(([hour, n]) => (
              <div key={hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
                <div
                  className="w-full rounded-t bg-primary/80"
                  style={{ height: `${Math.max(8, (n / maxHour) * 120)}px` }}
                  title={`${hour} · ${n} image(s)`}
                />
                <span className="w-full truncate text-center font-mono text-[9px] text-muted-foreground">
                  {hour.slice(11, 16)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
