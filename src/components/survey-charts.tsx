"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Gauge,
  Layers,
  PieChart,
  ScrollText,
  Shield,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CLASS_COLOR, CLASS_LABEL } from "@/lib/labels";
import type { ScanLogEntry } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Toggle } from "@/components/ui/toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GraphId = "mix" | "timeline" | "confidence" | "speed" | "risk";

const GRAPHS: { id: GraphId; label: string; hint: string; icon: typeof BarChart3 }[] = [
  { id: "mix", label: "Class mix", hint: "What the detector found", icon: PieChart },
  { id: "timeline", label: "Intake", hint: "Images entered over time", icon: Activity },
  { id: "confidence", label: "Confidence", hint: "How sure the model was", icon: Gauge },
  { id: "speed", label: "Latency", hint: "Milliseconds per image", icon: Clock3 },
  { id: "risk", label: "Hazard", hint: "Cleanup priority scores", icon: Shield },
];

const TOOLTIP_STYLE = {
  background: "oklch(0.2 0.03 220)",
  border: "1px solid oklch(0.32 0.03 210)",
  borderRadius: 10,
  fontSize: 12,
  color: "oklch(0.93 0.02 200)",
};

export function SurveyCharts({ entries }: { entries: ScanLogEntry[] }) {
  const [on, setOn] = useState<GraphId[]>(["mix", "timeline", "confidence"]);
  const [showLog, setShowLog] = useState(true);
  const stats = useMemo(() => buildStats(entries), [entries]);

  const toggle = (id: GraphId) => {
    setOn((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Insight k="Images logged" v={String(stats.scans)} d="Each upload is kept" />
        <Insight k="Hazards plotted" v={String(stats.hits)} d="Pins survive map zoom" />
        <Insight
          k="Top class"
          v={stats.topClass ? CLASS_LABEL[stats.topClass] ?? stats.topClass : "—"}
          d={stats.topClass ? `${stats.byClass[stats.topClass]} detections` : "Run a scan"}
        />
        <Insight
          k="Mean confidence"
          v={stats.hits ? `${stats.meanConf.toFixed(0)}%` : "—"}
          d={stats.scans ? `${stats.meanMs.toFixed(0)} ms average` : "Awaiting images"}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">Toggle graphs</p>
          <p className="text-xs text-muted-foreground">
            Show only the views you need. Charts update as new sonar images are entered.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GRAPHS.map((g) => {
            const Icon = g.icon;
            const active = on.includes(g.id);
            return (
              <Toggle
                key={g.id}
                pressed={active}
                onPressedChange={() => toggle(g.id)}
                variant="outline"
                size="sm"
                className={
                  active
                    ? "border-primary/50 bg-primary/15 text-foreground data-[state=on]:bg-primary/20"
                    : ""
                }
                title={g.hint}
              >
                <Icon />
                {g.label}
              </Toggle>
            );
          })}
        </div>
      </div>

      {!entries.length ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-14 text-center">
          <Layers className="mx-auto mb-3 size-8 text-primary/70" />
          <p className="font-medium">No survey series yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Upload a sonar log or click a gallery sample. Each image is recorded and these graphs
            fill in live.
          </p>
        </div>
      ) : on.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          All graphs are hidden. Toggle one above to bring a chart back.
        </p>
      ) : (
        <div className={`grid gap-4 ${on.length === 1 ? "grid-cols-1" : "xl:grid-cols-2"}`}>
          {on.includes("mix") && (
            <ChartCard
              title="Debris class mix"
              subtitle="Share of recorded hazards — use this to brief cleanup crews"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.classRows} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 210 / 0.6)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={108}
                    tick={{ fill: "oklch(0.85 0.02 200)", fontSize: 11 }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "oklch(0.78 0.12 195 / 0.08)" }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={18}>
                    {stats.classRows.map((row) => (
                      <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#5eead4"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("timeline") && (
            <ChartCard
              title="Images entered"
              subtitle="Intake cadence — each point is a sonar file someone submitted"
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.timeline} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="intakeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5eead4" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#5eead4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 210 / 0.6)" />
                  <XAxis dataKey="label" tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="images"
                    name="Images"
                    stroke="#5eead4"
                    fill="url(#intakeFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="hits"
                    name="Hazards"
                    stroke="#38bdf8"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("confidence") && (
            <ChartCard
              title="Fused confidence"
              subtitle="After shadow / contrast filtering — low bins are likely clutter"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.confBuckets} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 210 / 0.6)" />
                  <XAxis dataKey="label" tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Detections" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("speed") && (
            <ChartCard
              title="Onboard latency"
              subtitle="Edge-friendly YOLO11n — lower is better for AUV use"
            >
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={stats.speed} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 210 / 0.6)" />
                  <XAxis dataKey="i" tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} name="Scan" />
                  <YAxis tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} unit=" ms" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="ms"
                    name="Inference ms"
                    stroke="#fbbf24"
                    fill="#fbbf24"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {on.includes("risk") && (
            <ChartCard
              title="Hazard score"
              subtitle="Ghost gear and wrecks rank higher for cleanup order"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.risk} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 210 / 0.6)" />
                  <XAxis dataKey="label" tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.72 0.03 200)", fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="score" name="Mean hazard" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {stats.risk.map((row) => (
                      <Cell key={row.class} fill={CLASS_COLOR[row.class] ?? "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <ScrollText className="size-4 text-primary" />
          <div>
            <p className="font-medium">Intake log</p>
            <p className="text-xs text-muted-foreground">
              Timestamp, filename, hits, and latency for every image entered
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Show table
          <Switch checked={showLog} onCheckedChange={setShowLog} />
        </label>
      </div>

      {showLog &&
        (entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log is empty until the first image is scanned.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When (UTC)</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Hits</TableHead>
                  <TableHead>ms</TableHead>
                  <TableHead>Top class</TableHead>
                  <TableHead>Survey</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.slice(0, 50).map((e) => {
                  const top = [...e.detections].sort((a, b) => b.confidence - a.confidence)[0];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">
                        {e.at.replace("T", " ").slice(0, 19)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{e.filename}</TableCell>
                      <TableCell className="font-medium">{e.count}</TableCell>
                      <TableCell className="font-mono text-xs">{e.inference_ms}</TableCell>
                      <TableCell className="text-xs">
                        {top ? `${CLASS_LABEL[top.class] ?? top.class} ${top.confidence.toFixed(0)}%` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{e.survey}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
    </div>
  );
}

function Insight({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 to-transparent px-4 py-3">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{k}</p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight">{v}</p>
      <p className="truncate text-xs text-muted-foreground">{d}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60 p-4 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.04)]">
      <div className="mb-3 flex items-start gap-2">
        <BarChart3 className="mt-0.5 size-4 text-primary" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function buildStats(entries: ScanLogEntry[]) {
  const byClass: Record<string, number> = {};
  const riskSum: Record<string, number> = {};
  const riskN: Record<string, number> = {};
  const buckets = [
    { key: "0-25", lo: 0, hi: 25, count: 0 },
    { key: "25-50", lo: 25, hi: 50, count: 0 },
    { key: "50-75", lo: 50, hi: 75, count: 0 },
    { key: "75-100", lo: 75, hi: 101, count: 0 },
  ];
  const bySlot: Record<string, { images: number; hits: number }> = {};
  let confSum = 0;
  let hits = 0;
  let msSum = 0;
  const chronological = [...entries].reverse();
  const speed = chronological.map((e, i) => ({ i: i + 1, ms: e.inference_ms }));

  for (const e of entries) {
    msSum += e.inference_ms;
    const slot = e.at.slice(11, 16);
    if (!bySlot[slot]) bySlot[slot] = { images: 0, hits: 0 };
    bySlot[slot].images += 1;
    bySlot[slot].hits += e.count;
    for (const d of e.detections) {
      hits += 1;
      confSum += d.confidence;
      byClass[d.class] = (byClass[d.class] ?? 0) + 1;
      riskSum[d.class] = (riskSum[d.class] ?? 0) + d.hazard_score;
      riskN[d.class] = (riskN[d.class] ?? 0) + 1;
      const b = buckets.find((x) => d.confidence >= x.lo && d.confidence < x.hi);
      if (b) b.count += 1;
    }
  }

  const classRows = Object.entries(byClass)
    .sort((a, b) => b[1] - a[1])
    .map(([cls, count]) => ({
      class: cls,
      label: CLASS_LABEL[cls] ?? cls,
      count,
    }));
  const topClass = classRows[0]?.class ?? "";
  const timeline = Object.entries(bySlot)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, images: v.images, hits: v.hits }));
  const risk = Object.keys(riskN).map((cls) => ({
    class: cls,
    label: CLASS_LABEL[cls] ?? cls,
    score: Math.round(riskSum[cls] / riskN[cls]),
  }));

  return {
    scans: entries.length,
    hits,
    byClass,
    topClass,
    meanConf: hits ? confSum / hits : 0,
    meanMs: entries.length ? msSum / entries.length : 0,
    classRows,
    timeline,
    confBuckets: buckets.map((b) => ({ label: b.key + "%", count: b.count })),
    speed,
    risk,
  };
}
